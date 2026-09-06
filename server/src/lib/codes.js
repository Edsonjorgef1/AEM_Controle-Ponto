import { randomBytes } from 'node:crypto';

/**
 * Conteúdo do QR Code: um token opaco, sem dados pessoais, para que um
 * cartão perdido não revele nada e possa ser revogado individualmente.
 * Formato: AEM-<32 hex>
 */
export function generateQrToken() {
  return `AEM-${randomBytes(16).toString('hex')}`;
}

/**
 * Código interno legível, sequencial por categoria (ex.: FUN0001).
 * Recebe o cliente da transação para que a sequência seja calculada
 * e usada dentro do mesmo bloco atómico.
 */
export async function nextInternalCode(client, categoryId, prefix) {
  const { rows } = await client.query(
    `SELECT COALESCE(MAX(NULLIF(regexp_replace(internal_code, '^[A-Z]+', ''), '')::INTEGER), 0) AS max
       FROM members
      WHERE category_id = $1 AND internal_code ~ ('^' || $2 || '[0-9]+$')`,
    [categoryId, prefix],
  );
  return `${prefix}${String(Number(rows[0].max) + 1).padStart(4, '0')}`;
}
