import { NextResponse } from 'next/server';
import { ControlServiceRequestError } from '@/lib/control-service-client';

export const toRouteErrorResponse = (error: unknown) => {
  if (error instanceof ControlServiceRequestError) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: `control_service_${error.status}`,
          message: error.message,
          details: error.details ?? {},
        },
      },
      { status: error.status },
    );
  }

  console.error(error);
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: 'internal_error',
        message: 'Unexpected error.',
      },
    },
    { status: 500 },
  );
};
