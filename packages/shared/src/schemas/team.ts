import { z } from 'zod';

export const createTeamSchema = z.object({
  name: z.string().min(1, 'Team name is required'),
  description: z.string().optional(),
  colour: z.string().optional().default('#3b82f6'),
});

export const updateTeamSchema = createTeamSchema.partial();

export const addTeamMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['lead', 'member']).default('member'),
});

export const addProjectMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['ADMIN', 'MANAGER', 'TEAM_LEAD', 'MEMBER', 'GUEST']).default('MEMBER'),
});

export type CreateTeamDto = z.input<typeof createTeamSchema>;
export type UpdateTeamDto = z.input<typeof updateTeamSchema>;
export type AddTeamMemberDto = z.input<typeof addTeamMemberSchema>;
export type AddProjectMemberDto = z.input<typeof addProjectMemberSchema>;
