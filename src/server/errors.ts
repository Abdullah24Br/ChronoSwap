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

export class InvalidTransitionError extends DomainError {
  constructor(from: string, to: string) {
    super("INVALID_TRANSITION", `Session cannot move from ${from} to ${to}`);
  }
}
