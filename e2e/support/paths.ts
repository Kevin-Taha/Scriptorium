import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Synthetic 36-page textbook generated in global setup. */
export const FIXTURE_PDF = path.resolve(here, '..', '.fixtures', 'sample-textbook.pdf');

/** The same textbook with Roman front matter and decimal page labels. */
export const LABELLED_FIXTURE_PDF = path.resolve(here, '..', '.fixtures', 'labelled-textbook.pdf');

/** Optional large real-world PDF for local stress tests (set SCRIPTORIUM_STRESS_PDF). */
export const STRESS_PDF = process.env.SCRIPTORIUM_STRESS_PDF;
