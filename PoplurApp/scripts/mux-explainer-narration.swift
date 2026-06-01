import AVFoundation
import Foundation

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let videoURL = root.appendingPathComponent("assets/videos/poplr-explainer.mp4")
let audioURL = root.appendingPathComponent("assets/videos/poplr-explainer-narration.aiff")
let outputURL = root.appendingPathComponent("assets/videos/poplr-explainer-narrated.mp4")

try? FileManager.default.removeItem(at: outputURL)

let composition = AVMutableComposition()
let videoAsset = AVURLAsset(url: videoURL)
let audioAsset = AVURLAsset(url: audioURL)

let videoDuration = try await videoAsset.load(.duration)
let audioDuration = try await audioAsset.load(.duration)
let exportDuration = CMTimeMinimum(videoDuration, audioDuration)

guard
    let sourceVideoTrack = try await videoAsset.loadTracks(withMediaType: .video).first,
    let compositionVideoTrack = composition.addMutableTrack(
        withMediaType: .video,
        preferredTrackID: kCMPersistentTrackID_Invalid
    )
else {
    throw NSError(domain: "MuxExplainer", code: 1, userInfo: [NSLocalizedDescriptionKey: "Missing video track"])
}

try compositionVideoTrack.insertTimeRange(
    CMTimeRange(start: .zero, duration: videoDuration),
    of: sourceVideoTrack,
    at: .zero
)
compositionVideoTrack.preferredTransform = try await sourceVideoTrack.load(.preferredTransform)

if let sourceAudioTrack = try await audioAsset.loadTracks(withMediaType: .audio).first,
   let compositionAudioTrack = composition.addMutableTrack(
    withMediaType: .audio,
    preferredTrackID: kCMPersistentTrackID_Invalid
   ) {
    try compositionAudioTrack.insertTimeRange(
        CMTimeRange(start: .zero, duration: exportDuration),
        of: sourceAudioTrack,
        at: .zero
    )
}

guard let export = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality) else {
    throw NSError(domain: "MuxExplainer", code: 2, userInfo: [NSLocalizedDescriptionKey: "Could not create exporter"])
}

export.outputURL = outputURL
export.outputFileType = .mp4
export.shouldOptimizeForNetworkUse = true
export.timeRange = CMTimeRange(start: .zero, duration: videoDuration)

await export.export()

if export.status != .completed {
    throw export.error ?? NSError(domain: "MuxExplainer", code: 3, userInfo: [NSLocalizedDescriptionKey: "Export failed"])
}

print(outputURL.path)
