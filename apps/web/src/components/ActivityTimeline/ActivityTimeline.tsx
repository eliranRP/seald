import { forwardRef, useEffect, useRef, useState } from 'react';
import type { ActivityTimelineProps } from './ActivityTimeline.types';
import {
  Body,
  BodyAt,
  BodyBy,
  BodyHead,
  BodyMeta,
  BodyPending,
  Dot,
  DotWrap,
  Empty,
  KindPill,
  ProgressRail,
  Rail,
  Root,
  Row,
  Text,
} from './ActivityTimeline.styles';

/**
 * Vertical activity rail with one entry per event. Matches the kit's
 * EnvelopeDetail timeline: tone-colored dots, optional pulsing for
 * pending entries, and a staggered fade-in on mount so new timelines
 * animate in rather than pop.
 */
export const ActivityTimeline = forwardRef<HTMLDivElement, ActivityTimelineProps>(
  function ActivityTimeline(props, ref) {
    const { events, staggerMs = 180, ...rest } = props;
    const [visible, setVisible] = useState(0);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
      // Reset when the list identity changes. Skip animation entirely
      // when staggerMs=0 so tests / reduced-motion reads are instant.
      if (staggerMs === 0) {
        setVisible(events.length);
        return undefined;
      }
      setVisible(0);
      let i = 0;
      const tick = () => {
        i += 1;
        setVisible(i);
        if (i < events.length) timerRef.current = setTimeout(tick, staggerMs);
      };
      timerRef.current = setTimeout(tick, 250);
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    }, [events, staggerMs]);

    if (events.length === 0) {
      return (
        <Root ref={ref} {...rest}>
          <Empty>No activity recorded yet.</Empty>
        </Root>
      );
    }

    const heightPct =
      events.length === 0 ? 0 : (Math.min(visible, events.length) / events.length) * 100;

    return (
      <Root ref={ref} {...rest}>
        <Rail />
        <ProgressRail $heightPct={heightPct} />
        {events.map((e, i) => {
          const shown = i < visible;
          const Icon = e.icon;
          const pending = e.pending === true;
          return (
            <Row key={e.id} $visible={shown}>
              <DotWrap>
                <Dot $tone={e.tone} $visible={shown} $pending={pending} aria-hidden>
                  <Icon size={14} />
                </Dot>
              </DotWrap>
              <Body>
                <BodyHead>
                  <Text>{e.text}</Text>
                  <KindPill $tone={e.tone}>{e.kind}</KindPill>
                </BodyHead>
                <BodyMeta>
                  <BodyBy>{e.by}</BodyBy>
                  {e.at !== null ? (
                    <>
                      <span>·</span>
                      <BodyAt>{e.at}</BodyAt>
                    </>
                  ) : (
                    <>
                      <span>·</span>
                      <BodyPending>in progress</BodyPending>
                    </>
                  )}
                </BodyMeta>
              </Body>
            </Row>
          );
        })}
      </Root>
    );
  },
);
ActivityTimeline.displayName = 'ActivityTimeline';
