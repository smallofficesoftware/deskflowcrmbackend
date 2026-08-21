// Every field position/size in buildTemplate.js is hand-placed for A4
// portrait (210x297mm). Rather than maintaining separate hardcoded layouts
// per paper size, this scales the WHOLE template proportionally: same
// relative layout, resized to fit.
export const PAGE_SIZES = {
  A4: { width: 210, height: 297 },
  A5: { width: 148, height: 210 },
};

export function resolvePageDimensions({ pageSize = "A4", customWidth, customHeight, orientation = "portrait" } = {}) {
  let width;
  let height;
  if (pageSize === "Custom") {
    width = Number(customWidth) || PAGE_SIZES.A4.width;
    height = Number(customHeight) || PAGE_SIZES.A4.height;
  } else {
    const preset = PAGE_SIZES[pageSize] || PAGE_SIZES.A4;
    width = preset.width;
    height = preset.height;
  }
  if (orientation === "landscape") {
    [width, height] = [Math.max(width, height), Math.min(width, height)];
  } else {
    [width, height] = [Math.min(width, height), Math.max(width, height)];
  }
  return { width, height };
}

function scaleBoxDimension(box, scale) {
  if (!box || typeof box !== "object") return box;
  const out = { ...box };
  for (const k of ["top", "right", "bottom", "left"]) {
    if (typeof box[k] === "number") out[k] = box[k] * scale;
  }
  return out;
}

function scaleCellStyles(styles, scale) {
  if (!styles) return styles;
  return {
    ...styles,
    fontSize: typeof styles.fontSize === "number" ? styles.fontSize * scale : styles.fontSize,
    padding: scaleBoxDimension(styles.padding, scale),
    borderWidth:
      typeof styles.borderWidth === "number" ? styles.borderWidth * scale : scaleBoxDimension(styles.borderWidth, scale),
  };
}

function scaleField(field, scale) {
  const scaled = {
    ...field,
    position: { x: field.position.x * scale, y: field.position.y * scale },
    width: field.width * scale,
    height: field.height * scale,
  };
  if (typeof scaled.fontSize === "number") scaled.fontSize *= scale;
  if (typeof scaled.padding === "number") scaled.padding *= scale;
  else if (scaled.padding) scaled.padding = scaleBoxDimension(scaled.padding, scale);
  if (typeof scaled.borderWidth === "number") scaled.borderWidth *= scale;
  else if (scaled.borderWidth) scaled.borderWidth = scaleBoxDimension(scaled.borderWidth, scale);
  if (scaled.headStyles) scaled.headStyles = scaleCellStyles(scaled.headStyles, scale);
  if (scaled.bodyStyles) scaled.bodyStyles = scaleCellStyles(scaled.bodyStyles, scale);
  if (scaled.tableStyles) {
    scaled.tableStyles = {
      ...scaled.tableStyles,
      borderWidth: typeof scaled.tableStyles.borderWidth === "number" ? scaled.tableStyles.borderWidth * scale : scaled.tableStyles.borderWidth,
    };
  }
  // headWidthPercentages/columnStyles are already relative (%) — no scaling.
  return scaled;
}

// Rescales an already-built template to fit new target dimensions. Uniform
// scale = min(widthRatio, heightRatio), anchored top-left, so it always fits
// without distorting proportions.
export function scaleTemplate(template, targetWidth, targetHeight) {
  const { width: currentWidth, height: currentHeight } = template.basePdf;
  const scale = Math.min(targetWidth / currentWidth, targetHeight / currentHeight);
  if (Math.abs(scale - 1) < 1e-6) return template;

  const cloned = structuredClone(template);
  cloned.basePdf.width = targetWidth;
  cloned.basePdf.height = targetHeight;
  cloned.basePdf.padding = cloned.basePdf.padding.map((p) => p * scale);
  cloned.basePdf.staticSchema = (cloned.basePdf.staticSchema || []).map((f) => scaleField(f, scale));
  cloned.schemas = cloned.schemas.map((page) => page.map((f) => scaleField(f, scale)));
  return cloned;
}
