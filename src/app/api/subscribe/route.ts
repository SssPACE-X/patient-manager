import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Helper to push to DB
export async function POST(req: Request) {
    try {
        const subscription = await req.json();

        // Store in Supabase
        const { error } = await supabase
            .from('push_subscriptions')
            .insert([{ subscription }]);

        if (error && error.code !== '23505') { // ignore duplicate unique constraint
            console.error('Error saving subscription:', error);
            return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error in subscribe route:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
