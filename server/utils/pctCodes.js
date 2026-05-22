// Maps item category keywords to PCT codes (Pakistan Customs Tariff 2025-26, Chapter 72-73)
const PCT_MAP = [
  // GI / Galvanized coils and sheets
  { match: ['COIL,GI', 'GI COIL', 'GALVANIZED'],     pctCode: '72104990', description: 'Flat-rolled, galvanized (zinc coated), iron/non-alloy steel' },

  // CRC — Cold Rolled Coils/Sheets
  { match: ['COIL,CRC', 'CRC COIL', 'COLD ROLLED', 'COLD-ROLLED'], pctCode: '72091590', description: 'Flat-rolled, cold-rolled, width ≥600mm, iron/non-alloy steel' },

  // HR — Hot Rolled Coils/Sheets/Plates
  { match: ['COIL,HR', 'HR COIL', 'HOT ROLLED', 'HOT-ROLLED', 'PLATE,HR', 'SHEET,HR'], pctCode: '72085190', description: 'Flat-rolled, hot-rolled, width ≥600mm, iron/non-alloy steel' },

  // SS — Stainless Steel
  { match: ['COIL,SS', 'SS COIL', 'STAINLESS'],       pctCode: '72193290', description: 'Flat-rolled, stainless steel, cold-rolled, width ≥600mm' },

  // Rebar / TMT / Deformed bars
  { match: ['REBAR', 'TMT', 'DEFORMED BAR', 'IRON ROD', 'SARYA'], pctCode: '72142090', description: 'Bars/rods with deformations, iron/non-alloy steel' },

  // Steel bars and rods (plain round / square)
  { match: ['BAR,MS', 'ROD,MS', 'MILD STEEL BAR', 'ROUND BAR', 'SQUARE BAR'], pctCode: '72149990', description: 'Other bars and rods, iron/non-alloy steel' },

  // Structural — Angles (L-sections)
  { match: ['ANGLE', 'L-SECTION', 'L SECTION', 'L-3', 'L-4', 'L-5'], pctCode: '72162100', description: 'L sections (angles), iron/non-alloy steel, height <80mm' },

  // Structural — Channels (U/C sections)
  { match: ['CHANNEL', 'U-SECTION', 'C-SECTION'],     pctCode: '72163190', description: 'U sections (channels), iron/non-alloy steel, height ≥80mm' },

  // Structural — I-beams / H-beams
  { match: ['I-BEAM', 'H-BEAM', 'JOIST', 'I BEAM'],  pctCode: '72163290', description: 'I sections (beams), iron/non-alloy steel, height ≥80mm' },

  // ERW / Welded circular pipes
  { match: ['PIPE,ERW', 'ERW PIPE', 'WELDED PIPE', 'GI PIPE', 'PIPE,GI', 'PIPE,MS'], pctCode: '73063090', description: 'Welded circular pipes, iron/non-alloy steel' },

  // Seamless pipes
  { match: ['PIPE,SML', 'SEAMLESS PIPE', 'SML PIPE'], pctCode: '73043900', description: 'Seamless pipes, circular, iron/non-alloy steel' },

  // Square / Rectangular hollow sections (SHS/RHS)
  { match: ['SHS', 'RHS', 'SQUARE PIPE', 'RECTANGULAR PIPE', 'HOLLOW SECTION', 'BOX SECTION'], pctCode: '73066100', description: 'Welded, square/rectangular cross-section pipes' },

  // Steel wire (plain)
  { match: ['WIRE,MS', 'MS WIRE', 'BINDING WIRE', 'IRON WIRE'], pctCode: '72171000', description: 'Wire, iron/non-alloy steel, not plated or coated' },

  // Galvanized wire
  { match: ['GI WIRE', 'WIRE,GI', 'GALVANIZED WIRE'], pctCode: '72172000', description: 'Wire, plated or coated with zinc' },

  // Scrap steel
  { match: ['SCRAP', 'TUKRA', 'PATHAR'],               pctCode: '72042100', description: 'Waste and scrap, stainless steel' },
];

function getPctCode(itemName = '', itemCategory = '') {
  const searchText = `${itemName} ${itemCategory}`.toUpperCase();

  for (const entry of PCT_MAP) {
    if (entry.match.some(keyword => searchText.includes(keyword.toUpperCase()))) {
      return entry.pctCode;
    }
  }

  // Default fallback — general iron/steel flat-rolled product
  return '72085190';
}

module.exports = { getPctCode, PCT_MAP };
