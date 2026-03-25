import { NextResponse } from "next/server";

export type ApiEnvelope<T> = {
  ok: boolean;
  data?: T;
  errorCode?: string;
  message?: string;
};

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json<ApiEnvelope<T>>({ ok: true, data }, init);
}

export function fail(errorCode: string, message: string, status = 400) {
  return NextResponse.json<ApiEnvelope<never>>(
    {
      ok: false,
      errorCode,
      message,
    },
    { status },
  );
}