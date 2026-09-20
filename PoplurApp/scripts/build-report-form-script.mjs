// Emits a Google Apps Script that builds the beta test-report Google Form from
// src/report/betaTestPlan.ts, so the form and the site never disagree about the
// tests. Run: node --import <alias-register> scripts/build-report-form-script.mjs > out.gs
// (see .codex/beta-focus-group/poplur-beta-report-form.gs for the built copy).
import { createRequire } from 'node:module';
globalThis.require = createRequire(import.meta.url);
const plan = await import('@/report/betaTestPlan');

const q = s => JSON.stringify(String(s));
const lines = [];
const out = s => lines.push(s);

out(`// Poplur beta · Test report — builds the Google Form in your Drive.`);
out(`// Generated ${new Date().toISOString().slice(0, 10)} from src/report/betaTestPlan.ts (version ${plan.REPORT_VERSION}).`);
out(`// Run once: script.google.com → New project → paste → Run "buildPoplurBetaReportForm" → allow →`);
out(`// Execution log shows the form link, the edit link and the responses sheet.`);
out(``);
out(`function buildPoplurBetaReportForm() {`);
out(`  const form = FormApp.create('Poplur beta · Test report');`);
out(`  form.setDescription(${q(`One report per round, about five minutes: run the tests on your phone, say what happened, then the feedback. ${plan.REPORT_POINTS} points each on the prize board, ${plan.REPORT_POINTS_LATE} if it arrives after the due day. Due: ${plan.REPORT_ROUNDS.map(r => `report ${r.number} ${r.dueLabel}`).join(' · ')}. Use the email you signed the tester agreement with, so the points land on your name. Poplur is a private beta — no screenshots outside the group.`)});`);
out(`  form.setProgressBar(true).setShowLinkToRespondAgain(true).setAllowResponseEdits(false).setLimitOneResponsePerUser(false);`);
out(`  form.setConfirmationMessage(${q(`Thank you — your report is in. ${plan.REPORT_POINTS} points go on the board with Monday's standings (${plan.REPORT_POINTS_LATE} if it was late). Come back to this form for the next round.`)});`);
out(``);
out(`  // Page 1 — who and which report`);
out(`  form.addTextItem().setTitle('Full name').setHelpText('As on your tester agreement.').setRequired(true);`);
out(`  form.addTextItem().setTitle('Email').setHelpText('The one you signed the tester agreement with.').setRequired(true)`);
out(`    .setValidation(FormApp.createTextValidation().setHelpText('Enter a valid email address.').requireTextIsEmail().build());`);
out(`  form.addTextItem().setTitle('Discord username').setHelpText('For the standings post.');`);
out(`  const phone = form.addMultipleChoiceItem().setTitle('Phone').setRequired(true);`);
out(`  phone.setChoices([phone.createChoice('iPhone'), phone.createChoice('Android')]);`);
out(`  form.addTextItem().setTitle('Phone model').setHelpText('iPhone 13, Pixel 7, Galaxy A03…').setRequired(true);`);
out(`  form.addTextItem().setTitle('OS version').setHelpText('iPhone: Settings → General → About. Android: Settings → About phone.').setRequired(true);`);
out(`  const which = form.addMultipleChoiceItem().setTitle('Which report is this?').setRequired(true);`);
out(``);
out(`  // One section per round; each ends by jumping to the feedback section.`);
out(`  const breaks = {};`);
for (const r of plan.REPORT_ROUNDS) {
  out(`  breaks[${r.number}] = form.addPageBreakItem().setTitle(${q(`Report ${r.number} · ${r.name}`)}).setHelpText(${q(`${r.blurb} Run each test on your phone, then pick what happened. Due ${r.dueLabel}.`)});`);
  r.tasks.forEach((t, i) => {
    out(`  { const it = form.addMultipleChoiceItem().setTitle(${q(`${i + 1}. ${t.title}`)}).setHelpText(${q(`${t.steps} Expected: ${t.expect}`)}).setRequired(true);`);
    out(`    it.setChoices(${JSON.stringify(plan.TASK_RESULTS.map(x => x.label))}.map(function (c) { return it.createChoice(c); })); }`);
  });
  out(`  form.addParagraphTextItem().setTitle(${q(`Anything that didn't work or you couldn't try: what happened?`)}).setHelpText('Where you were in the app and what you expected instead. Screenshots go in #bugs on Discord.');`);
  for (const qn of r.questions.filter(x => !['broke', 'confused', 'change'].includes(x.id))) {
    if (qn.id === 'quote') {
      out(`  { const it = form.addMultipleChoiceItem().setTitle(${q('May we quote you by first name in our YC application?')}).setRequired(true); it.setChoices([it.createChoice('Yes'), it.createChoice('No')]); }`);
    } else {
      out(`  form.addParagraphTextItem().setTitle(${q(qn.question)})${qn.hint ? `.setHelpText(${q(qn.hint)})` : ''};`);
    }
  }
}
out(``);
out(`  // Feedback — the part every report must have.`);
out(`  const feedback = form.addPageBreakItem().setTitle('How it went').setHelpText('Required: this is the part we read first.');`);
for (const rt of plan.RATINGS) {
  out(`  form.addScaleItem().setTitle(${q(rt.label)}).setBounds(1, 5).setLabels(${q(rt.low)}, ${q(rt.high)}).setRequired(true);`);
}
out(`  form.addParagraphTextItem().setTitle(${q('What broke, froze or looked wrong this week?')}).setHelpText(${q('Write “nothing” if nothing did, and say what you tried.')}).setRequired(true);`);
out(`  form.addParagraphTextItem().setTitle(${q('What confused you, even for a second?')}).setRequired(true);`);
out(`  form.addParagraphTextItem().setTitle(${q('If you could change one thing, what would it be?')}).setRequired(true);`);
out(`  form.addParagraphTextItem().setTitle(${q('What made you open Poplur again — or not?')});`);
out(``);
out(`  // Routing: the chooser sends to a round; the page break after each round jumps to feedback.`);
const nums = plan.REPORT_ROUNDS.map(r => r.number);
out(`  which.setChoices([`);
for (const r of plan.REPORT_ROUNDS) out(`    which.createChoice(${q(`Report ${r.number} — ${r.name} (due ${r.dueLabel})`)}, breaks[${r.number}]),`);
out(`  ]);`);
for (let i = 1; i < nums.length; i++) out(`  breaks[${nums[i]}].setGoToPage(feedback);`);
out(``);
out(`  // Responses land in a sheet next to the form.`);
out(`  const sheet = SpreadsheetApp.create('Poplur beta · Test reports (responses)');`);
out(`  form.setDestination(FormApp.DestinationType.SPREADSHEET, sheet.getId());`);
out(``);
out(`  Logger.log('FORM (send this to testers): ' + form.getPublishedUrl());`);
out(`  Logger.log('EDIT: ' + form.getEditUrl());`);
out(`  Logger.log('RESPONSES: ' + sheet.getUrl());`);
out(`  return form.getPublishedUrl();`);
out(`}`);
process.stdout.write(lines.join('\n') + '\n');
