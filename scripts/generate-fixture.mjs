/**
 * Generate a deterministic, navigable synthetic textbook for reader tests.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PDFDocument, PDFHexString, PDFName, StandardFonts, rgb } from 'pdf-lib';

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 72;
const BODY_SIZE = 11;
const BODY_LEADING = 15;
const BODY_LINES = 30;
const FIGURE_TOP = 560;
const FIXED_DATE = new Date('2020-01-01T00:00:00.000Z');
const DEFAULT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'e2e',
  '.fixtures',
  'sample-textbook.pdf',
);

const CHAPTERS = [
  {
    title: 'Chapter 1: Kinematics',
    page: 3,
    sections: [
      { title: '1.1 Position and Displacement', page: 3 },
      { title: '1.2 Velocity', page: 6 },
      { title: '1.3 Acceleration', page: 9 },
    ],
  },
  {
    title: "Chapter 2: Newton's Laws",
    page: 11,
    sections: [
      { title: '2.1 Inertia and Force', page: 11 },
      { title: '2.2 The Second Law', page: 14 },
      { title: '2.3 Action and Reaction', page: 17 },
    ],
  },
  {
    title: 'Chapter 3: Energy and Work',
    page: 19,
    sections: [
      { title: '3.1 Work', page: 19 },
      { title: '3.2 Kinetic and Potential Energy', page: 22 },
      { title: '3.3 Conservation of Energy', page: 25 },
    ],
  },
  {
    title: 'Chapter 4: Momentum',
    page: 27,
    sections: [
      { title: '4.1 Linear Momentum', page: 27 },
      { title: '4.2 Impulse and Collisions', page: 30 },
      { title: '4.3 Conservation of Momentum', page: 33 },
    ],
  },
];
const APPENDIX = { title: 'Appendix A: Reference Tables', page: 35, sections: [] };
const CONTENTS = [...CHAPTERS, APPENDIX];

const WORDS = {
  adjectives: ['measured', 'observed', 'idealized', 'relative', 'initial', 'resulting', 'uniform'],
  quantities: ['motion', 'trajectory', 'velocity', 'acceleration', 'force', 'energy', 'momentum'],
  verbs: ['describes', 'illustrates', 'characterizes', 'represents', 'constrains'],
  contexts: ['the chosen frame', 'a physical system', 'the model', 'the experiment', 'the analysis'],
};

const CONSTANTS = [
  ['Speed of light', 'c', '299792458', 'm/s'],
  ['Gravitational constant', 'G', '6.67430e-11', 'm^3/kg/s^2'],
  ['Planck constant', 'h', '6.62607015e-34', 'J s'],
  ['Reduced Planck constant', 'hbar', '1.054571817e-34', 'J s'],
  ['Elementary charge', 'e', '1.602176634e-19', 'C'],
  ['Boltzmann constant', 'k_B', '1.380649e-23', 'J/K'],
  ['Avogadro constant', 'N_A', '6.02214076e23', '1/mol'],
  ['Molar gas constant', 'R', '8.314462618', 'J/mol/K'],
  ['Standard gravity', 'g_0', '9.80665', 'm/s^2'],
  ['Standard atmosphere', 'atm', '101325', 'Pa'],
  ['Fine-structure constant', 'alpha', '7.29735256e-3', '1'],
  ['Electron mass', 'm_e', '9.1093837e-31', 'kg'],
  ['Proton mass', 'm_p', '1.6726219e-27', 'kg'],
  ['Neutron mass', 'm_n', '1.6749275e-27', 'kg'],
  ['Vacuum permeability', 'mu_0', '1.2566371e-6', 'N/A^2'],
  ['Vacuum permittivity', 'epsilon_0', '8.8541878e-12', 'F/m'],
];

function centeredText(page, text, y, font, size) {
  page.drawText(text, {
    x: (PAGE_WIDTH - font.widthOfTextAtSize(text, size)) / 2,
    y,
    font,
    size,
  });
}

function makeDestination(doc, pages, pageNumber, top = 740) {
  return doc.context.obj([pages[pageNumber - 1].ref, PDFName.of('XYZ'), MARGIN, top, null]);
}

function addLink(doc, pages, page, rect, targetPage, top) {
  const annotation = doc.context.obj({
    Type: 'Annot',
    Subtype: 'Link',
    Rect: rect,
    Border: [0, 0, 0],
    Dest: makeDestination(doc, pages, targetPage, top),
  });
  page.node.addAnnot(doc.context.register(annotation));
}

function addOutline(doc, pages) {
  const { context } = doc;
  const outlines = context.obj({ Type: 'Outlines' });
  const outlinesRef = context.register(outlines);
  const set = (dict, key, value) => dict.set(PDFName.of(key), context.obj(value));

  function makeEntries(entries, parentRef, isSection = false) {
    const nodes = entries.map((entry) => {
      const dict = context.obj({
        Title: PDFHexString.fromText(entry.title),
        Parent: parentRef,
        Dest: makeDestination(doc, pages, entry.page, isSection ? 728 : 740),
      });
      return { dict, ref: context.register(dict), entry };
    });

    nodes.forEach(({ dict, entry }, index) => {
      if (index > 0) set(dict, 'Prev', nodes[index - 1].ref);
      if (index < nodes.length - 1) set(dict, 'Next', nodes[index + 1].ref);
      if (entry.sections?.length) {
        const children = makeEntries(entry.sections, nodes[index].ref, true);
        set(dict, 'First', children[0].ref);
        set(dict, 'Last', children[children.length - 1].ref);
        set(dict, 'Count', children.length);
      }
    });
    return nodes;
  }

  const entries = makeEntries(CONTENTS, outlinesRef);
  set(outlines, 'First', entries[0].ref);
  set(outlines, 'Last', entries[entries.length - 1].ref);
  set(
    outlines,
    'Count',
    CONTENTS.reduce((count, entry) => count + 1 + entry.sections.length, 0),
  );
  doc.catalog.set(PDFName.of('Outlines'), outlinesRef);
  doc.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'));
}

function drawFooter(page, pageNumber, font) {
  centeredText(page, `— ${pageNumber} —`, 38, font, 9);
}

function drawRunningHeader(page, title, font) {
  page.drawText(title, { x: MARGIN, y: 751, size: 9, font });
  page.drawLine({
    start: { x: MARGIN, y: 743 },
    end: { x: PAGE_WIDTH - MARGIN, y: 743 },
    thickness: 0.5,
    color: rgb(0.65, 0.65, 0.65),
  });
}

function drawTitlePage(page, fonts) {
  centeredText(page, 'Principles of Classical Mechanics', 478, fonts.bold, 29);
  centeredText(page, 'A Sample Textbook for Scriptorium', 434, fonts.regular, 17);
  centeredText(page, 'Scriptorium Test Fixtures', 386, fonts.helvetica, 12);
}

function drawContents(doc, pages, fonts) {
  const page = pages[1];
  page.drawText('Contents', { x: MARGIN, y: 710, font: fonts.bold, size: 25 });
  CONTENTS.forEach((entry, index) => {
    const y = 654 - index * 36;
    const size = 14;
    page.drawText(entry.title, { x: MARGIN, y, font: fonts.regular, size });
    const number = String(entry.page);
    page.drawText(number, {
      x: PAGE_WIDTH - MARGIN - fonts.regular.widthOfTextAtSize(number, size),
      y,
      font: fonts.regular,
      size,
    });
    addLink(doc, pages, page, [MARGIN, y - 3, PAGE_WIDTH - MARGIN, y + size], entry.page);
  });
  drawFooter(page, 2, fonts.helvetica);
}

function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function makeSentence(random) {
  const pick = (items) => items[Math.floor(random() * items.length)];
  const adjective = pick(WORDS.adjectives);
  const quantity = pick(WORDS.quantities);
  const verb = pick(WORDS.verbs);
  const context = pick(WORDS.contexts);
  return `The ${adjective} ${quantity} ${verb} a useful quantity in ${context}.`;
}

function drawFigure(page, fonts) {
  const left = 96;
  const bottom = FIGURE_TOP - 98;
  page.drawRectangle({
    x: left,
    y: bottom,
    width: 420,
    height: 98,
    borderWidth: 0.8,
    borderColor: rgb(0.2, 0.2, 0.2),
  });
  page.drawLine({
    start: { x: 125, y: 480 },
    end: { x: 475, y: 480 },
    thickness: 0.8,
  });
  page.drawLine({
    start: { x: 125, y: 480 },
    end: { x: 125, y: 546 },
    thickness: 0.8,
  });
  const point = (t) => ({ x: 150 + 280 * t, y: 480 + 55 * 4 * t * (1 - t) });
  for (let i = 0; i < 16; i += 1) {
    page.drawLine({
      start: point(i / 16),
      end: point((i + 1) / 16),
      thickness: 1.5,
      color: rgb(0.12, 0.3, 0.5),
    });
  }
  for (const t of [0, 0.5, 1]) {
    page.drawCircle({ ...point(t), size: 3, color: rgb(0.12, 0.3, 0.5) });
  }
  page.drawText('height', { x: 130, y: 541, font: fonts.helvetica, size: 8 });
  page.drawText('distance', { x: 435, y: 485, font: fonts.helvetica, size: 8 });
  centeredText(page, 'Figure 1.1: Projectile trajectory', 445, fonts.regular, 10);
}

function drawInlineLink(doc, pages, page, fonts, y, prefix, linkText, suffix, target, top) {
  const x = MARGIN;
  const linkX = x + fonts.regular.widthOfTextAtSize(prefix, BODY_SIZE);
  const linkWidth = fonts.regular.widthOfTextAtSize(linkText, BODY_SIZE);
  page.drawText(prefix, { x, y, font: fonts.regular, size: BODY_SIZE });
  page.drawText(linkText, { x: linkX, y, font: fonts.regular, size: BODY_SIZE });
  page.drawText(suffix, { x: linkX + linkWidth, y, font: fonts.regular, size: BODY_SIZE });
  addLink(doc, pages, page, [linkX, y - 3, linkX + linkWidth, y + BODY_SIZE], target, top);
}

function drawChapterPage(doc, pages, pageNumber, chapter, fonts, random) {
  const page = pages[pageNumber - 1];
  drawRunningHeader(page, chapter.title, fonts.helvetica);
  drawFooter(page, pageNumber, fonts.helvetica);
  const section = chapter.sections.find((item) => item.page === pageNumber);
  let y = 711;
  if (section) {
    page.drawText(section.title, { x: MARGIN, y, font: fonts.bold, size: 17 });
    y -= 31;
  }

  for (let line = 0; line < BODY_LINES; line += 1) {
    if (pageNumber === 7 && line === 9) {
      drawFigure(page, fonts);
      y = 421;
    }

    const sentence = makeSentence(random);
    if (pageNumber === 15 && line === 10) {
      drawInlineLink(
        doc,
        pages,
        page,
        fonts,
        y,
        'For the trajectory, ',
        'see Figure 1.1 on page 7',
        ' for a geometric illustration.',
        7,
        FIGURE_TOP,
      );
    } else if (pageNumber === 23 && line === 10) {
      drawInlineLink(
        doc,
        pages,
        page,
        fonts,
        y,
        'The reference values are tabulated ',
        '(Table A.1, p. 35)',
        ' for comparison.',
        35,
        715,
      );
    } else {
      page.drawText(sentence, { x: MARGIN, y, font: fonts.regular, size: BODY_SIZE });
    }
    y -= BODY_LEADING;
  }
}

function drawAppendixPage(page, pageNumber, fonts) {
  drawRunningHeader(page, APPENDIX.title, fonts.helvetica);
  drawFooter(page, pageNumber, fonts.helvetica);
  page.drawText(APPENDIX.title, { x: MARGIN, y: 711, font: fonts.bold, size: 17 });
  page.drawText('Table A.1: Physical constants', {
    x: MARGIN,
    y: 680,
    font: fonts.bold,
    size: 13,
  });
  if (pageNumber === 36) {
    page.drawText('(continued)', { x: 265, y: 680, font: fonts.regular, size: 11 });
  }

  const columns = [72, 270, 335, 465, 540];
  const top = 650;
  const rowHeight = 25;
  const rows = [
    ['Physical quantity', 'Symbol', 'Value', 'Unit'],
    ...CONSTANTS.slice((pageNumber - 35) * 8, (pageNumber - 34) * 8),
  ];
  for (const x of columns) {
    page.drawLine({ start: { x, y: top }, end: { x, y: top - rows.length * rowHeight }, thickness: 0.6 });
  }
  for (let index = 0; index <= rows.length; index += 1) {
    const y = top - index * rowHeight;
    page.drawLine({ start: { x: columns[0], y }, end: { x: columns[4], y }, thickness: 0.6 });
  }
  rows.forEach((row, index) => {
    row.forEach((value, column) => {
      page.drawText(value, {
        x: columns[column] + 5,
        y: top - index * rowHeight - 17,
        font: index === 0 ? fonts.bold : fonts.regular,
        size: 10,
      });
    });
  });
  page.drawText('Values are provided for illustrative reference.', {
    x: MARGIN,
    y: 404,
    font: fonts.regular,
    size: 10,
  });
}

export async function generateFixture(outPath = DEFAULT_PATH) {
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.setTitle('Principles of Classical Mechanics');
  doc.setAuthor('Scriptorium Test Fixtures');
  doc.setCreationDate(FIXED_DATE);
  doc.setModificationDate(FIXED_DATE);
  const fonts = {
    regular: await doc.embedFont(StandardFonts.TimesRoman),
    bold: await doc.embedFont(StandardFonts.TimesRomanBold),
    helvetica: await doc.embedFont(StandardFonts.Helvetica),
  };
  const pages = Array.from({ length: 36 }, () => doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]));
  const random = makeRandom(0x5c71b0);

  drawTitlePage(pages[0], fonts);
  drawContents(doc, pages, fonts);
  for (const chapter of CHAPTERS) {
    for (let pageNumber = chapter.page; pageNumber < chapter.page + 8; pageNumber += 1) {
      drawChapterPage(doc, pages, pageNumber, chapter, fonts, random);
    }
  }
  drawAppendixPage(pages[34], 35, fonts);
  drawAppendixPage(pages[35], 36, fonts);
  addOutline(doc, pages);

  const bytes = await doc.save({ useObjectStreams: false });
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, bytes);
  return outPath;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const outPath = await generateFixture();
  console.log(`Generated 36-page textbook fixture: ${outPath}`);
}
