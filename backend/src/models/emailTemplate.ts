import { db } from '../db'

export interface EmailTemplate {
  id: number
  name: string
  description: string | null
  subjectTemplate: string
  htmlTemplate: string
  createdBy: number | null
  createdAt: Date
  updatedAt: Date
}

export class EmailTemplateModel {
  static async list(): Promise<EmailTemplate[]> {
    const result = await db.query(
      `SELECT id, name, description,
              subject_template as "subjectTemplate",
              html_template as "htmlTemplate",
              created_by as "createdBy",
              created_at as "createdAt",
              updated_at as "updatedAt"
       FROM email_templates
       ORDER BY updated_at DESC, id DESC`
    )
    return result.rows
  }

  static async findById(id: number): Promise<EmailTemplate | null> {
    const result = await db.query(
      `SELECT id, name, description,
              subject_template as "subjectTemplate",
              html_template as "htmlTemplate",
              created_by as "createdBy",
              created_at as "createdAt",
              updated_at as "updatedAt"
       FROM email_templates
       WHERE id = $1`,
      [id]
    )
    return result.rows[0] || null
  }

  static async create(input: {
    name: string
    description?: string | null
    subjectTemplate: string
    htmlTemplate: string
    createdBy: number
  }): Promise<EmailTemplate> {
    const result = await db.query(
      `INSERT INTO email_templates
         (name, description, subject_template, html_template, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING id, name, description,
                 subject_template as "subjectTemplate",
                 html_template as "htmlTemplate",
                 created_by as "createdBy",
                 created_at as "createdAt",
                 updated_at as "updatedAt"`,
      [input.name, input.description || null, input.subjectTemplate, input.htmlTemplate, input.createdBy]
    )
    return result.rows[0]
  }

  static async update(
    id: number,
    input: {
      name: string
      description?: string | null
      subjectTemplate: string
      htmlTemplate: string
    }
  ): Promise<EmailTemplate | null> {
    const result = await db.query(
      `UPDATE email_templates
       SET name = $1,
           description = $2,
           subject_template = $3,
           html_template = $4,
           updated_at = NOW()
       WHERE id = $5
       RETURNING id, name, description,
                 subject_template as "subjectTemplate",
                 html_template as "htmlTemplate",
                 created_by as "createdBy",
                 created_at as "createdAt",
                 updated_at as "updatedAt"`,
      [input.name, input.description || null, input.subjectTemplate, input.htmlTemplate, id]
    )
    return result.rows[0] || null
  }

  static async delete(id: number): Promise<void> {
    await db.query(`DELETE FROM email_templates WHERE id = $1`, [id])
  }

  static async logCampaignSend(input: {
    templateId: number
    sentBy: number
    seasonId?: number | null
    roundNo?: number | null
    recipientCount: number
  }): Promise<void> {
    await db.query(
      `INSERT INTO email_campaign_logs
         (template_id, sent_by, season_id, round_no, recipient_count, sent_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [input.templateId, input.sentBy, input.seasonId || null, input.roundNo || null, input.recipientCount]
    )
  }
}
