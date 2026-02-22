import { NextResponse } from 'next/server';
import webPush from 'web-push';
import { supabase } from '@/lib/supabase';

export async function POST(req: Request) {
    try {
        if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
            webPush.setVapidDetails(
                'mailto:your-email@example.com',
                process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
                process.env.VAPID_PRIVATE_KEY
            );
        } else {
            console.error('VAPID keys not configured');
            return NextResponse.json({ error: 'Push not configured' }, { status: 500 });
        }
        const { message } = await req.json();

        const { data: subs, error } = await supabase
            .from('push_subscriptions')
            .select('subscription');

        if (error) throw error;

        if (subs && subs.length > 0) {
            const payload = JSON.stringify({
                title: '신규 환자 등록',
                body: message,
            });

            const promises = subs.map(sub =>
                webPush.sendNotification(sub.subscription, payload).catch((err: unknown) => {
                    console.error('Push error for sub', err);
                    // Optional: remove stale subscription from DB here based on err.statusCode === 410
                })
            );

            await Promise.all(promises);
        }

        return NextResponse.json({ success: true, count: subs?.length || 0 });
    } catch (error) {
        console.error('Error sending push:', error);
        return NextResponse.json({ error: 'Failed to send push' }, { status: 500 });
    }
}
