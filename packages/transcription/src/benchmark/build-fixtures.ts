import { buildFixtures } from './fixtures';

buildFixtures({ force: process.argv.includes('--force') })
  .then((built) => {
    for (const b of built) {
      console.log(`${b.caseId}: ${b.wavPath}${b.demoVideoPath ? ` + ${b.demoVideoPath}` : ''} (${b.durationMs} ms)`);
    }
    console.log(`Built ${built.length} fixtures.`);
  })
  .catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
