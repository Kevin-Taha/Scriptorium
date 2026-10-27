import { generateFixture } from '../scripts/generate-fixture.mjs';
import { generateLabelledFixture } from './support/labelled-fixture';
import { FIXTURE_PDF, LABELLED_FIXTURE_PDF } from './support/paths';

export default async function globalSetup(): Promise<void> {
  await generateFixture(FIXTURE_PDF);
  await generateLabelledFixture(FIXTURE_PDF, LABELLED_FIXTURE_PDF);
}
