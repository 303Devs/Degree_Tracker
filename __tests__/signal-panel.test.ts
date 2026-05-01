import { describe, expect, it } from 'vitest';
import {
  countSignalsBySeverity,
  groupSignalsByKind,
  SIGNAL_KIND_LABELS,
} from '../components/signal-panel-helpers';
import type { OptimizationSignal } from '../lib/plan-types';

function signal(
  id: string,
  kind: OptimizationSignal['kind'],
  severity: OptimizationSignal['severity'],
  message = `${id} factual message`,
): OptimizationSignal {
  return {
    id,
    kind,
    severity,
    scope: { type: 'plan' },
    message,
    evidence: {},
  };
}

describe('SignalPanel helpers', () => {
  it('groups all four accepted signal kinds in stable display order', () => {
    const grouped = groupSignalsByKind([
      signal('grad-1', 'graduation_risk', 'risk'),
      signal('load-1', 'semester_load', 'warning'),
      signal('delay-1', 'delayed_critical_course', 'warning'),
      signal('bottleneck-1', 'prereq_bottleneck', 'info'),
    ]);

    expect(grouped.map((group) => group.kind)).toEqual([
      'semester_load',
      'prereq_bottleneck',
      'delayed_critical_course',
      'graduation_risk',
    ]);
    expect(grouped.map((group) => group.signals.map((item) => item.id))).toEqual([
      ['load-1'],
      ['bottleneck-1'],
      ['delay-1'],
      ['grad-1'],
    ]);
  });

  it('sorts signals within a kind by severity and then id', () => {
    const grouped = groupSignalsByKind([
      signal('semester_load:SP27:warning', 'semester_load', 'warning'),
      signal('semester_load:FA27:info', 'semester_load', 'info'),
      signal('semester_load:FA26:risk', 'semester_load', 'risk'),
      signal('semester_load:SP26:warning', 'semester_load', 'warning'),
    ]);

    expect(grouped[0].signals.map((item) => item.id)).toEqual([
      'semester_load:FA26:risk',
      'semester_load:SP26:warning',
      'semester_load:SP27:warning',
      'semester_load:FA27:info',
    ]);
  });

  it('counts severities for the visual summary', () => {
    expect(countSignalsBySeverity([
      signal('a', 'semester_load', 'warning'),
      signal('b', 'graduation_risk', 'risk'),
      signal('c', 'prereq_bottleneck', 'warning'),
      signal('d', 'delayed_critical_course', 'info'),
    ])).toEqual({ info: 1, warning: 2, risk: 1 });
  });

  it('uses factual group labels without recommendation language', () => {
    const labels = Object.values(SIGNAL_KIND_LABELS).join(' ').toLowerCase();
    expect(labels).not.toMatch(/\b(should|must|recommend|better)\b/);
  });
});
