// The Poplur Beta Tester NDA as data, so the signing page (app/nda.tsx), the
// signed-copy email and the acceptance record all carry the same words. The
// text is the 15 Sep 2026 agreement (.codex/beta-focus-group/build-nda.js) with
// one change: section 10 now describes signing on the site rather than the
// Jotform link. Bump NDA_VERSION whenever a word changes — the version and a
// hash of the canonical text are stored with every acceptance.

export const NDA_VERSION = '2026-09-20';
export const NDA_TITLE = 'Beta Tester Non-Disclosure Agreement';
export const NDA_SUBTITLE = 'Apptist Inc., operating as Poplur · Private Beta, Fall 2026';
export const NDA_PARTIES = 'This agreement is between Apptist Inc., an Ontario corporation operating as Poplur ("Poplur", "we", "us"), and you, the beta tester named below ("you"). It starts on the date you sign it and covers everything you learn about Poplur while testing the app before it is publicly released.';
export const NDA_SUMMARY = 'what you see in the beta stays in the group; don’t post screenshots or share the link outside it; we can use your feedback; the app is unfinished and may break; you can leave at any time; testing is voluntary and separate from any school or job.';

export type NdaBlock = { text: string } | { bullets: string[] };
export type NdaSection = { heading: string; blocks: NdaBlock[] };

export const NDA_SECTIONS: NdaSection[] = [
  {
    heading: '1. What is confidential',
    blocks: [
      { text: '"Confidential Information" means anything about Poplur that is not already public, including:' },
      { bullets: [
        'the pre-release app itself, however you receive it (TestFlight, a direct install, the web), and any future builds;',
        'how it works — the map, the radius and reach system, feeds, claims, camera and AR features, AI tools, business accounts, and any feature or mechanic you see, whether finished or not;',
        'designs, artwork, prototypes, roadmaps, plans, pricing, metrics, performance, bugs, and security issues;',
        'screenshots, screen recordings, and descriptions of any of the above;',
        'content, names, and activity of other testers that you see inside the beta;',
        'anything shared in the Poplur focus-group Discord or in conversation with the Poplur team about the beta.',
      ] },
      { text: 'The fact that you are testing an app called Poplur is not confidential. The details above are.' },
    ],
  },
  {
    heading: '2. What is not confidential',
    blocks: [
      { text: 'Information is not confidential if it: (a) is or becomes public through no fault of yours; (b) you already knew before the beta, and can show it; (c) you receive lawfully from someone who is not bound to keep it secret; or (d) you develop on your own without using anything from the beta. If a law or court order requires you to disclose Confidential Information, you may do so, but tell us first if you legally can.' },
    ],
  },
  {
    heading: '3. What you agree to do',
    blocks: [
      { bullets: [
        'Keep Confidential Information to yourself and use it only to test Poplur and give us feedback.',
        'Do not post, stream, or share screenshots, recordings, or descriptions of the beta anywhere outside the focus-group Discord — including social media, other servers, group chats, and any other channel — unless we say so in writing.',
        'Do not share the TestFlight link or any build outside the focus group unless we have invited that person.',
        'Do not reverse-engineer, decompile, scrape, or probe the app or its services beyond normal use.',
        'If you find a security or privacy problem, tell us privately and do not exploit it or tell others.',
        'Do not speak to press or publish about Poplur without our written OK.',
      ] },
    ],
  },
  {
    heading: '4. Your feedback',
    blocks: [
      { text: 'We want your honest feedback, including criticism. Anything you tell us about the app — ideas, suggestions, bug reports, feature requests — you give us permission to use, change, and build on, worldwide, forever, without payment or credit. You are not giving up ownership of anything you create yourself; you are only letting us use the feedback.' },
    ],
  },
  {
    heading: '5. What you post in the beta',
    blocks: [
      { text: 'You keep ownership of the photos, videos, and other content you post. By posting during the beta you give Poplur the same licence described in the app’s terms, so we can display and test with it. The beta is a test environment: content, accounts, radius, and progress may be reset or deleted at any time. Only post content you have the right to post, and do not post other people’s private information.' },
    ],
  },
  {
    heading: '6. The app is unfinished',
    blocks: [
      { text: 'The beta is provided "as is". It may crash, drain your battery, lose data, behave strangely, or change without notice. We make no promises about it and are not responsible for problems it causes, to the extent the law allows. We are also not promising to release Poplur, or to keep any feature you see.' },
    ],
  },
  {
    heading: '7. How long this lasts',
    blocks: [
      { text: 'Your confidentiality obligations last while you are in the beta and for two (2) years after your last access to Confidential Information, or until Poplur makes the information public itself, whichever comes first. Sections 4 and 5 (feedback and content) continue after that. Either of us can end your participation at any time by saying so; if we ask, delete any beta builds, screenshots, or materials you still have.' },
    ],
  },
  {
    heading: '8. Voluntary',
    blocks: [
      { text: 'Taking part is entirely voluntary. It is not part of any course, program, or job at any school or employer, and it has no effect — positive or negative — on your grades, standing, references, or relationship with anyone who teaches or employs you. You can stop at any time without giving a reason. You confirm you are at least 18 years old.' },
    ],
  },
  {
    heading: '9. General',
    blocks: [
      { text: 'This agreement is governed by the laws of Ontario and Canada. It is the entire agreement about the beta and replaces anything said earlier. If part of it is unenforceable, the rest still applies. You may not transfer it. An electronic signature or an electronic acceptance (Section 10) is as valid as a handwritten one.' },
    ],
  },
  {
    heading: '10. How to accept',
    blocks: [
      { text: 'Sign electronically on the Poplur website, on the page that shows this agreement: enter your full name, confirm that you have read the agreement and that you are at least 18, and press Sign. Your name, your email address, the time, and the version of this agreement are recorded, and a signed copy is emailed to you and to Poplur. If you cannot use that page, sign a printed copy and return it to the Poplur team. Either way counts as your signature under this agreement.' },
    ],
  },
];

/** The agreement as one plain-text document — what gets hashed and what the
 *  signed copy carries. Stable across renderers: no HTML, one blank line
 *  between paragraphs, bullets as "- ". */
export function ndaCanonicalText(): string {
  const out: string[] = [`Poplur ${NDA_TITLE}`, NDA_SUBTITLE, `Version ${NDA_VERSION}`, '', NDA_PARTIES, '', `Plain-language summary (the sections below are what count): ${NDA_SUMMARY}`, ''];
  for (const section of NDA_SECTIONS) {
    out.push(section.heading);
    for (const block of section.blocks) {
      if ('text' in block) out.push(block.text);
      else for (const bullet of block.bullets) out.push(`- ${bullet}`);
    }
    out.push('');
  }
  return out.join('\n').trim() + '\n';
}

/** What an acceptance records. The same shape goes into the signed copy the
 *  signer receives, the copy Poplur keeps, and the API's answer. */
export type NdaAcceptance = {
  name: string;
  email: string;
  discord: string | null;
  /** The Discord username of whoever referred them (so Mark knows how people hear about it). */
  referredBy: string | null;
  /** The Google account on their Android phone, for Play Console's internal-testing list. */
  androidEmail: string | null;
  signedAt: string;
  ndaVersion: string;
  ndaSha256: string;
  ip: string | null;
  userAgent: string | null;
};
