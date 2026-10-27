import { WORKBENCH_STEPS } from '@cocktail/shared';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

const STEPS = WORKBENCH_STEPS;

type Props = {
  current: number;
};

export function WorkbenchStepIndicator({ current }: Props) {
  return (
    <View style={styles.row}>
      {STEPS.map((label, index) => {
        const active = index === current;
        const done = index < current;
        return (
          <View key={label} style={styles.item}>
            {index > 0 ? (
              <View style={[styles.line, (done || active) && styles.lineActive]} />
            ) : null}
            <View style={[styles.dot, (active || done) && styles.dotActive]}>
              <Text style={[styles.dotText, (active || done) && styles.dotTextActive]}>
                {index + 1}
              </Text>
            </View>
            <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    position: 'relative',
  },
  line: {
    position: 'absolute',
    top: 14,
    right: '50%',
    width: '100%',
    height: 2,
    backgroundColor: colors.border,
    zIndex: 0,
  },
  lineActive: {
    backgroundColor: colors.primary,
  },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  dotActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  dotText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  dotTextActive: {
    color: colors.text,
  },
  label: {
    marginTop: 6,
    color: colors.muted,
    fontSize: 11,
    fontWeight: '600',
  },
  labelActive: {
    color: colors.primary,
  },
});
