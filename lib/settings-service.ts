import { supabase } from '@/lib/supabase'

export interface SiteSettings {
    contact_info: {
        email: string
        phone: string
        address?: string
    }
    hero_banner: {
        title: string
        subtitle: string
        image_url?: string
    }
    social_links: {
        facebook?: string
        twitter?: string
        instagram?: string
        linkedin?: string
    }
}

export async function getSiteSettings(): Promise<SiteSettings> {
    try {
        const { data, error } = await supabase
            .from('site_settings')
            .select('*')

        if (error) throw error

        const settings: any = {}
        data?.forEach((item) => {
            settings[item.key] = item.value
        })

        return settings as SiteSettings
    } catch (error) {
        console.error("Error fetching site settings:", error)
        return {
            contact_info: { email: "", phone: "" },
            hero_banner: { title: "", subtitle: "" },
            social_links: {}
        }
    }
}

export async function updateSiteSettings(key: string, value: any): Promise<{ error: any }> {
    try {
        const { error } = await supabase
            .from('site_settings')
            .upsert({ key, value, updated_at: new Date().toISOString() })

        return { error }
    } catch (error) {
        return { error }
    }
}
