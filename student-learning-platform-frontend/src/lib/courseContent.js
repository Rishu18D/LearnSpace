export function getPublishedLessons(course) {
  const modules = course?.modules || [];
  if (modules.length) {
    return modules
      .filter(module => module.published !== false && !module.archived)
      .flatMap(module =>
        (module.lessons || [])
          .filter(lesson => lesson.published !== false && !lesson.archived)
          .map(lesson => ({ ...lesson, moduleId: module._id, moduleTitle: module.title }))
      );
  }

  return (course?.lessons || []).filter(lesson => lesson.published !== false && !lesson.archived);
}
