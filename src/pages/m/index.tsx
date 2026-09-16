'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function MobileIndex() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/m/dashboard');
  }, [router]);
  return null;
}
