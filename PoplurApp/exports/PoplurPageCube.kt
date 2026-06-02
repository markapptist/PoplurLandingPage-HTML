@file:Suppress("MemberVisibilityCanBePrivate")

package com.poplur.graphics

import com.badlogic.gdx.Gdx
import com.badlogic.gdx.Input.Buttons
import com.badlogic.gdx.graphics.Color
import com.badlogic.gdx.graphics.GL20
import com.badlogic.gdx.graphics.PerspectiveCamera
import com.badlogic.gdx.graphics.Pixmap
import com.badlogic.gdx.graphics.Texture
import com.badlogic.gdx.graphics.VertexAttributes.Usage
import com.badlogic.gdx.graphics.g2d.BitmapFont
import com.badlogic.gdx.graphics.g2d.GlyphLayout
import com.badlogic.gdx.graphics.g2d.SpriteBatch
import com.badlogic.gdx.graphics.g3d.Environment
import com.badlogic.gdx.graphics.g3d.Material
import com.badlogic.gdx.graphics.g3d.Model
import com.badlogic.gdx.graphics.g3d.ModelBatch
import com.badlogic.gdx.graphics.g3d.ModelInstance
import com.badlogic.gdx.graphics.g3d.attributes.ColorAttribute
import com.badlogic.gdx.graphics.g3d.attributes.TextureAttribute
import com.badlogic.gdx.graphics.g3d.environment.DirectionalLight
import com.badlogic.gdx.graphics.g3d.environment.PointLight
import com.badlogic.gdx.graphics.g3d.utils.ModelBuilder
import com.badlogic.gdx.input.GestureDetector
import com.badlogic.gdx.math.MathUtils
import com.badlogic.gdx.math.Matrix4
import com.badlogic.gdx.utils.Disposable

/**
 * LibGDX port of the Poplur React/Three.js page cube.
 *
 * Drop this file into your Android/Core LibGDX source set, then render it from a Screen:
 *
 *   val cube = PoplurPageCube(listener)
 *   Gdx.input.inputProcessor = GestureDetector(cube)
 *
 *   override fun render(delta: Float) {
 *       cube.render(delta, Gdx.graphics.width.toFloat(), Gdx.graphics.height.toFloat())
 *   }
 *
 * The cube renders into a small viewport centered near the bottom of the screen by default.
 */
class PoplurPageCube(
    private val listener: Listener? = null,
    labels: List<String> = listOf("Home", "Beta", "About")
) : GestureDetector.GestureAdapter(), Disposable {

    interface Listener {
        fun onSwipePage(page: Int)
        fun onSwipeSection(section: Int)
    }

    var currentPage: Int = 0
        private set

    var currentSection: Int = 0
        private set

    var pageProgress: Float = 0f

    var pageLabels: List<String> = labels
        set(value) {
            field = value.ifEmpty { listOf("Home", "Beta", "About") }
        }

    var sizePx: Float = 118f
    var bottomOffsetPx: Float = 96f

    private val modelBatch = ModelBatch()
    private val spriteBatch = SpriteBatch()
    private val font = BitmapFont()
    private val glyphLayout = GlyphLayout()
    private val labelProjection = Matrix4()
    private val camera = PerspectiveCamera(42f, sizePx, sizePx)
    private val environment = Environment()

    private val textures = listOf(
        createFaceTexture("#4a0a3b", "#ff1797"),
        createFaceTexture("#4a0a3b", "#ff49b6"),
        createFaceTexture("#4a0a3b", "#ff1797")
    )
    private val model: Model = createCubeModel(textures)
    private val instance = ModelInstance(model)

    private var baseRotationX = 0f
    private var baseRotationY = 0f
    private var rotationX = 0f
    private var rotationY = 0f
    private var rotationZ = 0f
    private var floatElapsed = 0f
    private var popElapsed = POP_DURATION
    private var dragTotalX = 0f
    private var dragTotalY = 0f
    private var isDragging = false
    private var animatingRotation = false
    private var rotationAnimElapsed = 0f
    private var rotationStartX = 0f
    private var rotationStartY = 0f
    private var rotationEndX = 0f
    private var rotationEndY = 0f

    init {
        camera.position.set(0f, 0f, 4.7f)
        camera.lookAt(0f, 0f, 0f)
        camera.near = 0.1f
        camera.far = 100f
        camera.update()

        environment.set(ColorAttribute(ColorAttribute.AmbientLight, 1f, 0.83f, 0.93f, 1.35f))
        environment.add(DirectionalLight().set(Color.WHITE, 2.4f, 3f, 4f))
        environment.add(PointLight().set(Color.valueOf("ff1797"), -2f, -1.5f, 3f, 3.2f))
        environment.add(PointLight().set(Color.WHITE, 1.8f, -2.2f, 2.6f, 1.1f))

        font.color = Color.valueOf("fff7fb")
        font.data.setScale(2.05f)
    }

    fun setState(page: Int = currentPage, section: Int = currentSection) {
        currentPage = page.coerceIn(0, 1)
        currentSection = section.coerceIn(0, 1)
        pageProgress = currentPage.toFloat()
    }

    fun pop() {
        popElapsed = 0f
    }

    fun render(
        delta: Float,
        screenWidth: Float,
        screenHeight: Float,
        centerX: Float = screenWidth / 2f,
        centerY: Float = bottomOffsetPx + sizePx / 2f
    ) {
        update(delta)

        val viewportSize = sizePx.toInt().coerceAtLeast(1)
        val viewportX = (centerX - sizePx / 2f).toInt()
        val viewportY = (centerY - sizePx / 2f).toInt()

        camera.viewportWidth = sizePx
        camera.viewportHeight = sizePx
        camera.update()

        Gdx.gl.glViewport(viewportX, viewportY, viewportSize, viewportSize)
        Gdx.gl.glEnable(GL20.GL_DEPTH_TEST)
        Gdx.gl.glEnable(GL20.GL_BLEND)
        Gdx.gl.glBlendFunc(GL20.GL_SRC_ALPHA, GL20.GL_ONE_MINUS_SRC_ALPHA)

        val floatY = MathUtils.sin(floatElapsed * 1.35f) * 0.11f
        val popScale = if (popElapsed < POP_DURATION) {
            val t = (popElapsed / POP_DURATION).coerceIn(0f, 1f)
            val falloff = kotlin.math.exp((-t * 2.2f).toDouble()).toFloat()
            1f + 0.32f * MathUtils.sin(MathUtils.PI * t) * falloff
        } else {
            1f
        }

        instance.transform.idt()
            .translate(0f, floatY, 0f)
            .rotate(1f, 0f, 0f, rotationX * MathUtils.radiansToDegrees)
            .rotate(0f, 1f, 0f, rotationY * MathUtils.radiansToDegrees)
            .rotate(0f, 0f, 1f, rotationZ * MathUtils.radiansToDegrees)
            .scale(popScale, popScale, popScale)

        modelBatch.begin(camera)
        modelBatch.render(instance, environment)
        modelBatch.end()

        renderLabel(screenWidth, screenHeight, centerX, centerY)
        Gdx.gl.glViewport(0, 0, screenWidth.toInt(), screenHeight.toInt())
    }

    override fun touchDown(x: Float, y: Float, pointer: Int, button: Int): Boolean {
        if (button != Buttons.LEFT && button != -1) return false
        isDragging = true
        dragTotalX = 0f
        dragTotalY = 0f
        animatingRotation = false
        return true
    }

    override fun pan(x: Float, y: Float, deltaX: Float, deltaY: Float): Boolean {
        if (!isDragging) return false
        dragTotalX += deltaX
        dragTotalY += deltaY
        rotationY = baseRotationY + dragTotalX * 0.013f
        rotationX = baseRotationX - dragTotalY * 0.013f
        return true
    }

    override fun panStop(x: Float, y: Float, pointer: Int, button: Int): Boolean {
        if (!isDragging) return false
        isDragging = false
        finishSwipe()
        return true
    }

    private fun update(delta: Float) {
        floatElapsed += delta
        if (popElapsed < POP_DURATION) popElapsed += delta

        val showingAbout = currentPage == 0 && currentSection == 1
        val targetX = if (showingAbout) -MathUtils.PI / 2f else 0f
        val targetY = -pageProgress.coerceIn(0f, 1f) * MathUtils.PI / 2f

        if (animatingRotation) {
            rotationAnimElapsed += delta
            val progress = (rotationAnimElapsed / ROTATION_DURATION).coerceIn(0f, 1f)
            val eased = 1f - (1f - progress) * (1f - progress) * (1f - progress)
            rotationX = MathUtils.lerp(rotationStartX, rotationEndX, eased)
            rotationY = MathUtils.lerp(rotationStartY, rotationEndY, eased)
            if (progress >= 1f) {
                baseRotationX = rotationEndX
                baseRotationY = rotationEndY
                animatingRotation = false
                pop()
            }
            return
        }

        if (!isDragging) {
            baseRotationX += (targetX - baseRotationX) * 0.2f
            baseRotationY += (targetY - baseRotationY) * 0.2f
            rotationX += (baseRotationX - rotationX) * 0.22f
            rotationY += (baseRotationY - rotationY) * 0.22f
            rotationZ += (0f - rotationZ) * 0.22f
        }
    }

    private fun finishSwipe() {
        val absDx = kotlin.math.abs(dragTotalX)
        val absDy = kotlin.math.abs(dragTotalY)
        var endX = baseRotationX
        var endY = baseRotationY

        if (absDx >= absDy && absDx > SWIPE_THRESHOLD) {
            val next = if (dragTotalX < 0f) (currentPage + 1).coerceAtMost(1) else (currentPage - 1).coerceAtLeast(0)
            if (next != currentPage) {
                currentPage = next
                currentSection = 0
                pageProgress = next.toFloat()
                endX = 0f
                endY = -next * MathUtils.PI / 2f
                listener?.onSwipeSection(0)
                listener?.onSwipePage(next)
            }
        } else if (absDy > absDx && absDy > SWIPE_THRESHOLD && currentPage == 0) {
            val next = if (dragTotalY < 0f) (currentSection + 1).coerceAtMost(1) else (currentSection - 1).coerceAtLeast(0)
            if (next != currentSection) {
                currentSection = next
                endX = if (next == 1) -MathUtils.PI / 2f else 0f
                endY = -pageProgress.coerceIn(0f, 1f) * MathUtils.PI / 2f
                listener?.onSwipeSection(next)
            }
        }

        animateRotationTo(endX, endY)
    }

    private fun animateRotationTo(endX: Float, endY: Float) {
        rotationStartX = rotationX
        rotationStartY = rotationY
        rotationEndX = endX
        rotationEndY = endY
        rotationAnimElapsed = 0f
        animatingRotation = true
    }

    private fun renderLabel(screenWidth: Float, screenHeight: Float, centerX: Float, centerY: Float) {
        Gdx.gl.glViewport(0, 0, screenWidth.toInt(), screenHeight.toInt())
        labelProjection.setToOrtho2D(0f, 0f, screenWidth, screenHeight)
        spriteBatch.projectionMatrix = labelProjection

        val label = when {
            currentPage == 0 && currentSection == 1 -> pageLabels.getOrElse(2) { "About" }
            currentPage == 1 -> pageLabels.getOrElse(1) { "Beta" }
            else -> pageLabels.getOrElse(0) { "Home" }
        }
        glyphLayout.setText(font, label)
        spriteBatch.begin()
        font.draw(spriteBatch, glyphLayout, centerX - glyphLayout.width / 2f, centerY + glyphLayout.height / 2f)
        spriteBatch.end()
    }

    private fun createCubeModel(faceTextures: List<Texture>): Model {
        val builder = ModelBuilder()
        builder.begin()
        val usage = Usage.Position.toLong() or Usage.Normal.toLong() or Usage.TextureCoordinates.toLong()
        val home = material(faceTextures[0])
        val beta = material(faceTextures[1])
        val about = material(faceTextures[2])
        val h = 0.775f

        builder.part("front-home", GL20.GL_TRIANGLES, usage, home)
            .rect(-h, -h, h, h, -h, h, h, h, h, -h, h, h, 0f, 0f, 1f)
        builder.part("right-beta", GL20.GL_TRIANGLES, usage, beta)
            .rect(h, -h, h, h, -h, -h, h, h, -h, h, h, h, 1f, 0f, 0f)
        builder.part("bottom-about", GL20.GL_TRIANGLES, usage, about)
            .rect(-h, -h, -h, h, -h, -h, h, -h, h, -h, -h, h, 0f, -1f, 0f)
        builder.part("left-home", GL20.GL_TRIANGLES, usage, home)
            .rect(-h, -h, -h, -h, -h, h, -h, h, h, -h, h, -h, -1f, 0f, 0f)
        builder.part("top-home", GL20.GL_TRIANGLES, usage, home)
            .rect(-h, h, h, h, h, h, h, h, -h, -h, h, -h, 0f, 1f, 0f)
        builder.part("back-home", GL20.GL_TRIANGLES, usage, home)
            .rect(h, -h, -h, -h, -h, -h, -h, h, -h, h, h, -h, 0f, 0f, -1f)

        return builder.end()
    }

    private fun material(texture: Texture): Material {
        return Material(
            TextureAttribute.createDiffuse(texture),
            ColorAttribute.createSpecular(Color.valueOf("ffd4ee")),
            ColorAttribute.createEmissive(Color.valueOf("3a062d"))
        )
    }

    override fun dispose() {
        modelBatch.dispose()
        spriteBatch.dispose()
        font.dispose()
        model.dispose()
        textures.forEach(Texture::dispose)
    }

    companion object {
        private const val SWIPE_THRESHOLD = 44f
        private const val POP_DURATION = 0.44f
        private const val ROTATION_DURATION = 0.32f

        private fun createFaceTexture(backgroundHex: String, accentHex: String): Texture {
            val size = 512
            val pixmap = Pixmap(size, size, Pixmap.Format.RGBA8888)
            val background = Color.valueOf(backgroundHex)
            val dark = Color.valueOf("1a071f")
            val accent = Color.valueOf(accentHex)

            for (y in 0 until size) {
                for (x in 0 until size) {
                    val diagonal = (x + y).toFloat() / (size * 2f)
                    val color = Color(background).lerp(dark, kotlin.math.min(diagonal, 0.7f))
                    val glow = radial(x, y, 256f, 248f, 245f) * 0.24f
                    val petals = maxOf(
                        radial(x, y, 228f, 196f, 92f),
                        radial(x, y, 316f, 196f, 92f),
                        radial(x, y, 228f, 284f, 92f),
                        radial(x, y, 316f, 284f, 92f)
                    )
                    color.lerp(accent, petals * 0.58f + glow)
                    pixmap.setColor(color)
                    pixmap.drawPixel(x, y)
                }
            }

            pixmap.setColor(Color.valueOf("ff49b6"))
            repeat(18) { inset ->
                pixmap.drawRectangle(18 + inset, 18 + inset, size - 36 - inset * 2, size - 36 - inset * 2)
            }

            val texture = Texture(pixmap)
            texture.setFilter(Texture.TextureFilter.Linear, Texture.TextureFilter.Linear)
            pixmap.dispose()
            return texture
        }

        private fun radial(x: Int, y: Int, cx: Float, cy: Float, radius: Float): Float {
            val dx = x - cx
            val dy = y - cy
            val distance = kotlin.math.sqrt(dx * dx + dy * dy)
            return (1f - distance / radius).coerceIn(0f, 1f)
        }
    }
}
