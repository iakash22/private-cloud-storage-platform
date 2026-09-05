/**
 * Minimal S3 XML serialization.
 *
 * The S3 wire format is a small, fixed set of documents, so a focused
 * serializer is preferred over adding an XML dependency. Every text value is
 * escaped, so object keys (which are user controlled) cannot inject markup.
 */

export type XmlValue = string | number | boolean | null | undefined | XmlNode | XmlNode[];

export interface XmlNode {
  [key: string]: XmlValue;
}

const S3_NAMESPACE = 'http://s3.amazonaws.com/doc/2006-03-01/';

/** Renders a complete S3 response document, including the XML declaration. */
export function renderS3Xml(rootName: string, body: XmlNode): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<${rootName} xmlns="${S3_NAMESPACE}">${renderChildren(body)}</${rootName}>`;
}

function renderChildren(node: XmlNode): string {
  return Object.entries(node)
    .map(([name, value]) => renderValue(name, value))
    .join('');
}

function renderValue(name: string, value: XmlValue): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (Array.isArray(value)) {
    // Repeated elements share the parent's element name, as S3 does for
    // <Contents> and <Part> collections.
    return value.map((entry) => renderValue(name, entry)).join('');
  }

  if (typeof value === 'object') {
    return `<${name}>${renderChildren(value)}</${name}>`;
  }

  return `<${name}>${escapeXml(String(value))}</${name}>`;
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
