/** Erro com código HTTP, convertido em resposta JSON pelo error handler. */
export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }

  static badRequest(message, details) { return new ApiError(400, message, details); }
  static unauthorized(message = 'Sessão inválida ou expirada') { return new ApiError(401, message); }
  static forbidden(message = 'Não tem permissão para esta operação') { return new ApiError(403, message); }
  static notFound(message = 'Registo não encontrado') { return new ApiError(404, message); }
  static conflict(message, details) { return new ApiError(409, message, details); }
}

/** Envolve um handler async para que rejeições cheguem ao error middleware. */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/** Valida `data` com um schema zod e devolve o resultado tipado. */
export function parse(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({
      campo: i.path.join('.') || '(raiz)',
      erro: i.message,
    }));
    throw ApiError.badRequest('Dados inválidos', details);
  }
  return result.data;
}
