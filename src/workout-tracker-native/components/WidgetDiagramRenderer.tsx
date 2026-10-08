import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import { attachDiagramRenderer, DIAGRAM_SIZE, finishDiagramJob, type DiagramJob } from '../utils/widgetDiagrams';

/**
 * Draws each muscle diagram the iOS Up Next widget needs and captures it as a
 * PNG (utils/widgetDiagrams.ts explains why). Mounted behind the tab
 * navigator, which covers it: captureRef draws the view's own hierarchy, so it
 * doesn't have to be visible, only laid out.
 */
export default function WidgetDiagramRenderer() {
  const [job, setJob] = useState<DiagramJob | null>(null);
  const stage = useRef<View>(null);

  useEffect(() => attachDiagramRenderer(setJob), []);

  useEffect(() => {
    if (!job) return;
    // One frame for SvgXml to parse and draw before the capture
    const timer = setTimeout(() => {
      captureRef(stage, { format: 'png', result: 'tmpfile', width: DIAGRAM_SIZE, height: DIAGRAM_SIZE })
        .then(png => finishDiagramJob(job, png))
        .catch(() => finishDiagramJob(job, null));
    }, 100);
    return () => clearTimeout(timer);
  }, [job]);

  if (!job) return null;
  return (
    <View ref={stage} collapsable={false} pointerEvents="none" style={styles.stage}>
      <SvgXml xml={job.svg} width={DIAGRAM_SIZE} height={DIAGRAM_SIZE} />
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { position: 'absolute', top: 0, left: 0, width: DIAGRAM_SIZE, height: DIAGRAM_SIZE },
});
