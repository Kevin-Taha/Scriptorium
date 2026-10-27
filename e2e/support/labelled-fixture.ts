import { readFile, writeFile } from 'node:fs/promises';
import { PDFDocument, PDFName } from 'pdf-lib';

export async function generateLabelledFixture(source: string, destination: string): Promise<void> {
  const document = await PDFDocument.load(await readFile(source), { updateMetadata: false });
  document.catalog.set(
    PDFName.of('PageLabels'),
    document.context.obj({
      Nums: [0, { S: PDFName.of('r') }, 2, { S: PDFName.of('D'), St: 1 }],
    }),
  );
  await writeFile(destination, await document.save({ useObjectStreams: false }));
}
