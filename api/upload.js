import { createClient } from '@supabase/supabase-js';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '6mb'
    }
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { image, path } = req.body; // image: base64 data URL, path: "userId/itemId.jpg"

    if (!image || !path) {
      return res.status(400).json({ error: 'Missing image or path' });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    const { error: uploadError } = await supabase.storage
      .from('wishlist-photos')
      .upload(path, buffer, { contentType: 'image/jpeg', upsert: true });

    if (uploadError) {
      return res.status(500).json({ error: uploadError.message });
    }

    const { data } = supabase.storage.from('wishlist-photos').getPublicUrl(path);

    return res.status(200).json({ url: data.publicUrl });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}