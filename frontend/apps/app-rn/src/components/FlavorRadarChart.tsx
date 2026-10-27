import { StyleSheet, View } from 'react-native';
import Svg, { Line, Polygon, Text as SvgText } from 'react-native-svg';
import { FLAVOR_AXIS_LABELS } from '@cocktail/shared';
import { colors } from '../theme';

type Props = {
  /** 六维 0~1；空数组或未分析时只画网格 */
  values: number[];
  size?: number;
};

export function FlavorRadarChart({ values, size = 132 }: Props) {
  const n = 6;
  const labelPad = 22;
  const svgW = size + labelPad * 2;
  const svgH = size + labelPad * 2;
  const cx = svgW / 2;
  const cy = svgH / 2;
  const maxR = size * 0.36;
  const rings = [0.33, 0.66, 1];
  const hasData = values.length >= n && values.some((v) => v > 0);

  function point(i: number, ratio: number) {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    return {
      x: cx + Math.cos(angle) * maxR * ratio,
      y: cy + Math.sin(angle) * maxR * ratio,
    };
  }

  const polygon = hasData
    ? values
        .slice(0, n)
        .map((v, i) => {
          const p = point(i, Math.max(0.05, Math.min(1, v)));
          return `${p.x},${p.y}`;
        })
        .join(' ')
    : '';

  return (
    <View style={[styles.wrap, { width: svgW, height: svgH }]}>
      <Svg width={svgW} height={svgH}>
        {rings.map((r) => {
          const ringPts = Array.from({ length: n }, (_, i) => point(i, r));
          const pts = [...ringPts, ringPts[0]].map((p) => `${p.x},${p.y}`).join(' ');
          return (
            <Polygon
              key={r}
              points={pts}
              fill="none"
              stroke={colors.border}
              strokeWidth={1}
            />
          );
        })}
        {Array.from({ length: n }, (_, i) => {
          const p = point(i, 1);
          return (
            <Line
              key={`axis-${i}`}
              x1={cx}
              y1={cy}
              x2={p.x}
              y2={p.y}
              stroke={colors.border}
              strokeWidth={1}
            />
          );
        })}
        {hasData ? (
          <Polygon
            points={polygon}
            fill={`${colors.primary}55`}
            stroke={colors.primary}
            strokeWidth={2}
          />
        ) : null}
        {FLAVOR_AXIS_LABELS.map((label, i) => {
          const p = point(i, 1.38);
          const isTop = i === 0;
          const isBottom = i === 3;
          return (
            <SvgText
              key={label}
              x={p.x}
              y={p.y + (isTop ? -2 : isBottom ? 10 : 3)}
              fill={colors.muted}
              fontSize={9}
              textAnchor="middle"
              alignmentBaseline="middle"
            >
              {label}
            </SvgText>
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
