
import { stringify } from "csv-stringify/sync";

export function writeCsv(headers, rows) {
  const cols = headers;
  return stringify(rows, { header: true, columns: cols, quoted: true });
}
