// Expected business-rule failures. Server actions turn these into
// { ok: false, error } results; anything else is treated as a bug.
export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export class InsufficientBalanceError extends DomainError {
  constructor(message = "الرصيد المتاح غير كافٍ") {
    super("INSUFFICIENT_BALANCE", message);
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = "لا تملك صلاحية تنفيذ هذه العملية") {
    super("FORBIDDEN", message);
  }
}

export class NotFoundError extends DomainError {
  constructor(message = "العنصر غير موجود") {
    super("NOT_FOUND", message);
  }
}

export class EmailAlreadyExistsError extends DomainError {
  constructor(message = "البريد الإلكتروني مسجل مسبقاً") {
    super("EMAIL_EXISTS", message);
  }
}

export class InvalidCredentialsError extends DomainError {
  constructor(message = "بيانات الدخول غير صحيحة") {
    super("INVALID_CREDENTIALS", message);
  }
}

export class EmailNotVerifiedError extends DomainError {
  constructor(message = "يرجى تأكيد بريدك الإلكتروني أولاً قبل تسجيل الدخول") {
    super("EMAIL_NOT_VERIFIED", message);
  }
}

export class InvalidTokenError extends DomainError {
  constructor(message = "رابط التفعيل غير صالح أو منتهي الصلاحية") {
    super("INVALID_TOKEN", message);
  }
}

export class InvalidTransitionError extends DomainError {
  constructor(from: string, to: string) {
    super("INVALID_TRANSITION", `Session cannot move from ${from} to ${to}`);
  }
}
