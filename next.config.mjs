/** @type {import('next').NextConfig} */
import withPWAInit from 'next-pwa';

const withPWA = withPWAInit({
    dest: 'public',
    register: true,
    skipWaiting: true,
    customWorkerDir: 'public',
    disable: process.env.NODE_ENV === 'development', // disables PWA in dev
});

const nextConfig = {
    reactStrictMode: true,
};

export default withPWA(nextConfig);
