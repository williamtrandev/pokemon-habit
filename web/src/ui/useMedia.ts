import { useEffect, useState } from 'react';

// Theo dõi một media query từ trong JS.
//
// Dùng khi hai cỡ màn cần CẤU TRÚC khác nhau, không chỉ khác CSS: ở màn Bầy, bảng chăm sóc
// là cột dính bên phải khi rộng, còn khi hẹp thì là HỘP THOẠI. Hai thứ đó nằm ở hai chỗ khác
// nhau trong cây DOM nên không thể xử bằng breakpoint của Tailwind.
//
// Chỉ dùng cho những chỗ như vậy — chuyện gì CSS làm được thì để CSS làm, vì render theo JS
// thì lần vẽ đầu luôn dựa vào giá trị đo được sau khi mount.
export default function useMedia(query: string): boolean {
  const [match, setMatch] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false
  );

  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatch(mq.matches);
    onChange(); // query có thể đã đổi giữa lúc dựng state và lúc chạy effect
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);

  return match;
}
