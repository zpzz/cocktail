import { StyleSheet, Text, View } from 'react-native';

type Props = {
  title: string;
  description: string;
};

export function ScreenPlaceholder({ title, description }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#14110F',
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  title: {
    color: '#F4EDE4',
    fontSize: 28,
    fontWeight: '600',
    marginBottom: 12,
  },
  description: {
    color: '#C4B8AC',
    fontSize: 16,
    lineHeight: 24,
  },
});
