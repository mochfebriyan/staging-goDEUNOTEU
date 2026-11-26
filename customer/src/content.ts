// All landing-page copy, numbers, links and media slots live here, so
// filling in real content never means touching layout code.
//
// Anything marked TODO is a placeholder: replace it with GO DEUNOTEU's real
// content before launch. Media fields (`imageSrc`, `avatarSrc`, …) are empty
// on purpose; leaving them empty renders a labelled placeholder box.

export const BRAND = {
  name: 'DEUNOTEU GO',
  logoSrc: '/brand/logo.jpg',
}

export const HERO = {
  lines: ['Kartu Aikatsu', '& merch Jepang,', 'lebih dekat ke kamu.'],
  body:
    'Jajan kartu, ganci, dan merch Aikatsu dari Mercari Jepang bareng-bareng biar harganya lebih ramah. ' +
    'Rincian biayanya terbuka dari awal, dan progres pesananmu bisa kamu pantau sendiri kapan saja.',
}

// Row under the carousel. TODO: real count + thumbnails.
export const HIGHLIGHT_ROW = {
  label: '[N] batch lainnya sedang dibuka',
  href: '/id?tab=order',
  thumbnailSrcs: [undefined, undefined, undefined] as Array<string | undefined>,
}

export const STATS: Array<{ value: string; label: string }> = [
  { value: '1000+', label: 'Pesanan selesai' },
  { value: '500+', label: 'Testimoni pembeli' },
  { value: '2020', label: 'Berdiri sejak' },
]

export const ABOUT = {
  eyebrow: 'Tentang kami',
  title: 'Group order kartu dan merch Aikatsu dari Jepang.',
  body:
    'Kami bantu kamu jajan dari Mercari Jepang tanpa ribet: admin yang beli, barang dikumpulkan per batch dan box, ' +
    'lalu dikirim ke Indonesia. Posisi barang, tagihan, dan pajak bisa kamu cek sendiri di sini tanpa perlu chat admin dulu. ' +
    '[TODO: sesuaikan dengan cerita GO DEUNOTEU]',
}

// TODO: real profile URLs. `kind` picks the icon.
export const SOCIALS: Array<{ kind: 'line' | 'x' | 'instagram' | 'shop'; title: string; href: string }> = [
  { kind: 'line', title: 'LINE', href: '#' },
  { kind: 'x', title: 'X', href: '#' },
  { kind: 'instagram', title: 'Instagram', href: '#' },
  { kind: 'shop', title: 'Toko', href: '#' },
]

// TODO: lineHref = each admin's LINE profile link.
export const ADMINS: Array<{ name: string; role: string; bio: string; lineHref: string; avatarSrc?: string }> = [
  {
    name: 'Michelle',
    role: 'Admin Order, Tax, dan Pengiriman',
    bio: 'Yang mau persod dan reqshare Aikatsu bisa langsung PC LINE aja, on 24/7 kecuali tidur.',
    lineHref: '#',
    avatarSrc: '/admins/michelle.jpg',
  },
  {
    name: 'Kue',
    role: 'Admin Order',
    bio: 'Open persod dan reqshare, fast respond.',
    lineHref: '#',
    avatarSrc: '/admins/kue.jpg',
  },
]

export const TESTIMONIALS_SECTION = {
  eyebrow: 'Testimoni',
  title: 'Kata mereka yang sudah jajan.',
  body: 'Foto asli dari pembeli, dikirim langsung begitu paketnya sampai.',
}

// Buyer testimonials (first 6 shown on Home). Photos live in public/testimoni/.
// Every card has the same size: photos are cropped to 4:3 (landscape),
// centred, so keep the important part of a photo in the middle.
// `name` is optional; leave it out to hide the buyer row. Leave `photo` out
// for a text-only card.
export const TESTIMONIALS: Array<{
  text: string
  name?: string
  photo?: { photoSrc?: string }
}> = [
  { text: 'lov lov donat kk kue kk cel 🩷', photo: { photoSrc: '/testimoni/testi-1.jpg' } },
  { text: 'thank you kak micelll 🫶🫶🩷🩷🥺🥺', photo: { photoSrc: '/testimoni/testi-5.jpg' } },
  { text: 'Thank you Deunoteu 🩷', photo: { photoSrc: '/testimoni/testi-3.jpg' } },
  { text: 'maaciii kakkk mikkk ❤️❤️😘', photo: { photoSrc: '/testimoni/testi-2.jpg' } },
  { text: 'THANK YOU DEUNOTEU <3', photo: { photoSrc: '/testimoni/testi-4.jpg' } },
]

export const REVIEW_PROMPT = {
  title: `Gimana jajanmu di ${BRAND.name}?`,
  body: 'Kasih bintang, ceritakan pengalamanmu.',
  reward: '[Hadiah ulasan]', // TODO: remove the pill if there is no reward
  hint: 'Ketuk bintang untuk mulai',
  starLabels: ['Kurang', 'Biasa aja', 'Lumayan', 'Bagus', 'Suka banget'],
  href: (stars: number) => `#ulasan-${stars}`, // TODO: review form
}

// Floating "CS" button options.
export const CS_OPTIONS = {
  chatAdminLabel: 'Chat admin',
  chatAdminHref: '#', // TODO: LINE OpenChat / admin link
}
