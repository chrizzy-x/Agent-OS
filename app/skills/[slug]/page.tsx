import { notFound } from 'next/navigation';
import SkillDetailPage, { type SkillDetailRecord } from '@/components/pages/SkillDetailPage';
import { omitAgentIdentifierFields } from '@/src/auth/display-redaction';
import { readLocalRuntimeState } from '@/src/storage/local-state';
import { getSupabaseAdmin } from '@/src/storage/supabase';

async function loadPublishedSkill(id: string): Promise<SkillDetailRecord | null> {
  const isUuid = /^[0-9a-f-]{36}$/i.test(id);

  try {
    const supabase = getSupabaseAdmin();
    const query = supabase
      .from('skills')
      .select(`
        *,
        reviews:skill_reviews(rating, review_title, review_text, created_at, agent_id)
      `);
    const { data, error } = isUuid
      ? await query.eq('id', id).single()
      : await query.eq('slug', id).single();

    if (!error && data?.published === true) {
      return omitAgentIdentifierFields(data) as SkillDetailRecord;
    }
  } catch {
    // Fall back to local runtime state below.
  }

  const state = await readLocalRuntimeState();
  const skill = state.skills.catalog.find(item => (isUuid ? item.id === id : item.slug === id) && item.published);
  if (!skill) return null;

  return omitAgentIdentifierFields({
    ...skill,
    reviews: [],
  }) as SkillDetailRecord;
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const skill = await loadPublishedSkill(slug);
  if (!skill) notFound();
  return <SkillDetailPage initialSkill={skill} />;
}
