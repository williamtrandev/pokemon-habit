// Ảnh TRANG BỊ — sprite item chính chủ của PokeAPI. Lỗi tải (offline, slug đổi) -> rớt về
// emoji của món, không bao giờ trống. Bản web tương ứng: web/src/ui/components/Bits.tsx.
import React, { useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { HeldItem, itemSpriteUrl } from '../items';

export default function ItemSprite({ item, size }: { item: HeldItem; size: number }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [item.key]);

  if (broken) {
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: size * 0.7 }}>{item.emoji}</Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri: itemSpriteUrl(item) }}
      onError={() => setBroken(true)}
      style={{ width: size, height: size, resizeMode: 'contain' }}
    />
  );
}
