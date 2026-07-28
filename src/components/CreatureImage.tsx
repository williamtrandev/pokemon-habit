import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { spriteSources } from '../species';

interface Props {
  formId: number | null; // null = trứng
  shiny?: boolean;
  size: number;
  tint?: string; // đặt màu -> hiện dạng bóng đơn sắc (vd xám cho Pokémon chưa unlock)
}

// Ảnh động (GIF) của một Pokémon; tự chuyển sang ảnh dự phòng nếu lỗi. Bậc 0 = trứng emoji.
export default function CreatureImage({ formId, shiny = false, size, tint }: Props) {
  const [idx, setIdx] = useState(0);
  useEffect(() => setIdx(0), [formId, shiny]);

  if (formId == null) {
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: size * 0.66 }}>🥚</Text>
      </View>
    );
  }

  const sources = spriteSources(formId, shiny);
  if (idx >= sources.length) {
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: size * 0.5 }}>❔</Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri: sources[idx] }}
      style={{ width: size, height: size }}
      contentFit="contain"
      cachePolicy="memory-disk"
      transition={220}
      tintColor={tint}
      onError={() => setIdx((i) => i + 1)}
    />
  );
}
