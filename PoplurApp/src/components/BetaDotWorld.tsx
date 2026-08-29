import { View } from 'react-native';

export default function BetaDotWorld({ cells: _cells }: { cells: { place: string; events: number }[] }) {
  return <View aria-hidden style={{ position: 'absolute', inset: 0 } as never} />;
}
