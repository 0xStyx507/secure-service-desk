import { ExecutionContext, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetricsAccessGuard } from './metrics-access.guard';

function createContext(headers: Record<string, string | undefined>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        header: (name: string) => headers[name.toLowerCase()],
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('MetricsAccessGuard', () => {
  const token = 'metrics-token-with-at-least-32-characters';

  it('hides metrics when the endpoint is disabled', () => {
    const guard = new MetricsAccessGuard(
      new ConfigService({ metricsEnabled: false, metricsToken: token }),
    );

    expect(() => guard.canActivate(createContext({}))).toThrow(NotFoundException);
  });

  it('requires a configured token when metrics are enabled', () => {
    const guard = new MetricsAccessGuard(
      new ConfigService({ metricsEnabled: true, metricsToken: token }),
    );

    expect(() => guard.canActivate(createContext({}))).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(createContext({ 'x-metrics-token': 'wrong-token' }))).toThrow(
      UnauthorizedException,
    );
  });

  it('accepts the service token through a dedicated header or bearer auth', () => {
    const guard = new MetricsAccessGuard(
      new ConfigService({ metricsEnabled: true, metricsToken: token }),
    );

    expect(guard.canActivate(createContext({ 'x-metrics-token': token }))).toBe(true);
    expect(guard.canActivate(createContext({ authorization: `Bearer ${token}` }))).toBe(true);
  });
});
