export interface MentorDashboardQueryReaders<
  Trainee extends { id: string },
  Task,
  Relation,
  Progress,
  Reviewer,
> {
  findAssignedTraineeIds: (
    userId: string,
    evaluatedAt: Date,
  ) => Promise<string[]>;
  findEnabledTraineesByIds: (traineeIds: readonly string[]) => Promise<Trainee[]>;
  findEnabledTrainingTasks: () => Promise<Task[]>;
  findRelationsForTrainees: (traineeIds: readonly string[]) => Promise<Relation[]>;
  findProgressForTrainees: (traineeIds: readonly string[]) => Promise<Progress[]>;
  findActiveReviewerAssignmentsForTrainees: (
    traineeIds: readonly string[],
    evaluatedAt: Date,
  ) => Promise<Reviewer[]>;
}

export const readMentorDashboardData = async <
  Trainee extends { id: string },
  Task,
  Relation,
  Progress,
  Reviewer,
>(
  userId: string,
  evaluatedAt: Date,
  readers: MentorDashboardQueryReaders<Trainee, Task, Relation, Progress, Reviewer>,
) => {
  const assignedIds = Array.from(
    new Set(await readers.findAssignedTraineeIds(userId, evaluatedAt)),
  );
  if (assignedIds.length === 0) {
    return {
      trainees: [] as Trainee[],
      tasks: [] as Task[],
      relations: [] as Relation[],
      progress: [] as Progress[],
      reviewers: [] as Reviewer[],
    };
  }

  const [trainees, tasks] = await Promise.all([
    readers.findEnabledTraineesByIds(assignedIds),
    readers.findEnabledTrainingTasks(),
  ]);
  const enabledIds = trainees.map(({ id }) => id);
  if (enabledIds.length === 0) {
    return {
      trainees,
      tasks,
      relations: [] as Relation[],
      progress: [] as Progress[],
      reviewers: [] as Reviewer[],
    };
  }
  const [relations, progress, reviewers] = await Promise.all([
    readers.findRelationsForTrainees(enabledIds),
    readers.findProgressForTrainees(enabledIds),
    readers.findActiveReviewerAssignmentsForTrainees(enabledIds, evaluatedAt),
  ]);
  return { trainees, tasks, relations, progress, reviewers };
};
