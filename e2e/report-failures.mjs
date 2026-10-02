// CI helper: turns failed tests from the JUnit report into GitHub
// annotations, so failures are readable on the run page without log access.
import fs from 'node:fs';

const file = process.argv[2];
if (!fs.existsSync(file)) {
  console.log(`::error title=e2e::No report at ${file} (the run did not get to the tests)`);
  process.exit(0);
}

const xml = fs.readFileSync(file, 'utf8');
const decode = (s) => s
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'")
  .replace(/&amp;/g, '&');
const escape = (s) => s.replace(/%/g, '%25').replace(/\r/g, '').replace(/\n/g, '%0A');

for (const [, attrs, body] of xml.matchAll(/<testcase\b([^>]*)>([\s\S]*?)<\/testcase>/g)) {
  const failure = /<failure\b([^>]*)>([\s\S]*?)<\/failure>/.exec(body);
  if (!failure) continue;
  const name = decode(/name="([^"]*)"/.exec(attrs)?.[1] || 'test');
  const message = /message="([^"]*)"/.exec(failure[1])?.[1] || '';
  const detail = decode(`${message}\n${failure[2]}`).trim().slice(0, 3000);
  console.log(`::error title=${escape(name)}::${escape(detail)}`);
}
