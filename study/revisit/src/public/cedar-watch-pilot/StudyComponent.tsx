import { useCallback } from 'react';
import { StudyApp } from '../../../../src/StudyApp';
import type { PilotSession } from '../../../../src/protocol';

type RevisitStudyParams = {
  parameters?: Record<string, unknown>;
  setAnswer: (answer: { status: boolean; answers: Record<string, unknown> }) => void;
};

export default function StudyComponent({ setAnswer }: RevisitStudyParams) {
  const updateResponse = useCallback((session: PilotSession) => {
    setAnswer({
      status: session.status === 'complete',
      answers: { pilotSession: session },
    });
  }, [setAnswer]);
  return <StudyApp onSessionChange={updateResponse} />;
}
