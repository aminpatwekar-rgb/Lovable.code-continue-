import * as React from 'react'
import type { TemplateEntry } from './registry'
import { OnyxNotice, appUrl } from './onyx-notice'

type D = Record<string, any>
const due = (d?: string | null) => (d ? `Due ${new Date(d).toUTCString().slice(0, 22)} UTC.` : 'No due date.')

const AssignmentPosted = (p: D) => (
  <OnyxNotice
    preview={`New assignment: ${p.title ?? 'Assignment'}`}
    heading={`New assignment in ${p.className ?? 'your class'}`}
    lines={[`Hi ${p.name || 'there'},`, `"${p.title ?? 'A new assignment'}" was just posted.`, due(p.dueDate)]}
    ctaLabel="Open assignment"
    ctaUrl={appUrl(`/assignments/${p.assignmentId ?? ''}`)}
  />
)

const GradeReleased = (p: D) => (
  <OnyxNotice
    preview={`Your grade for ${p.title ?? 'an assignment'} is ready`}
    heading="Your grade is ready"
    lines={[
      `Hi ${p.name || 'there'},`,
      `Your teacher released your grade for "${p.title ?? 'an assignment'}"${p.className ? ` in ${p.className}` : ''}.`,
      p.marks != null ? `Score: ${p.marks}${p.maxMarks != null ? ` / ${p.maxMarks}` : ''}` : 'Open ONYX to see your score and feedback.',
    ]}
    ctaLabel="View feedback"
    ctaUrl={appUrl(`/assignments/${p.assignmentId ?? ''}`)}
  />
)

const SubmissionReceived = (p: D) => (
  <OnyxNotice
    preview={`We received your work for ${p.title ?? 'your assignment'}`}
    heading="Submission received"
    lines={[
      `Hi ${p.name || 'there'},`,
      `Your work for "${p.title ?? 'your assignment'}" was turned in${p.late ? ' (after the due date)' : ''}.`,
      'Your teacher will review it and you will get an email when your grade is released.',
    ]}
    ctaLabel="View submission"
    ctaUrl={appUrl(`/assignments/${p.assignmentId ?? ''}`)}
  />
)

const CoTeacherRequest = (p: D) => (
  <OnyxNotice
    preview={`${p.requester || 'A teacher'} wants to co-teach ${p.className ?? 'your class'}`}
    heading="New co-teacher request"
    lines={[
      `Hi ${p.name || 'there'},`,
      `${p.requester || 'A teacher'} entered your co-teacher code for ${p.className ?? 'your class'}.`,
      'They only get access once you approve them.',
    ]}
    ctaLabel="Review request"
    ctaUrl={appUrl(`/classes/${p.classId ?? ''}`)}
  />
)

export const assignmentPosted = {
  component: AssignmentPosted, displayName: 'New assignment posted',
  subject: (d: D) => `New assignment: ${d.title ?? 'Assignment'}`,
  previewData: { name: 'Riya', title: 'Lab report 3', className: 'Physics 11A', dueDate: '2026-11-02T10:00:00Z', assignmentId: 'x' },
} satisfies TemplateEntry

export const gradeReleased = {
  component: GradeReleased, displayName: 'Grade released',
  subject: (d: D) => `Your grade for ${d.title ?? 'an assignment'} is ready`,
  previewData: { name: 'Riya', title: 'Lab report 3', className: 'Physics 11A', marks: 18, maxMarks: 20, assignmentId: 'x' },
} satisfies TemplateEntry

export const submissionReceived = {
  component: SubmissionReceived, displayName: 'Submission received',
  subject: (d: D) => `Submitted: ${d.title ?? 'your assignment'}`,
  previewData: { name: 'Riya', title: 'Lab report 3', late: false, assignmentId: 'x' },
} satisfies TemplateEntry

export const coTeacherRequest = {
  component: CoTeacherRequest, displayName: 'Co-teacher request',
  subject: (d: D) => `${d.requester || 'A teacher'} wants to co-teach ${d.className ?? 'your class'}`,
  previewData: { name: 'Mr. Shah', requester: 'Ms. Rao', className: 'Physics 11A', classId: 'x' },
} satisfies TemplateEntry
