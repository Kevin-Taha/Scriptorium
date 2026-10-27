import { generateFixture } from '../scripts/generate-fixture.mjs';
import { FIXTURE_PDF } from './support/paths';

export default async function globalSetup(): Promise<void> {
  await generateFixture(FIXTURE_PDF);
}
