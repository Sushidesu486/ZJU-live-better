import "dotenv/config";

import axios from "axios";
import { COURSES, ZJUAM } from "login-zju";

function timeLeft(end, now = new Date()) {
  if (!end) return "No DDL";
  const delta = end.getTime() - now.getTime();
  const abs = Math.abs(delta);
  const days = Math.floor(abs / (1000 * 60 * 60 * 24));
  const hours = Math.floor(abs / (1000 * 60 * 60));
  const minutes = Math.floor(abs / (1000 * 60));
  const value = days > 0
    ? `${days} days`
    : hours > 0
      ? `${hours} hours`
      : `${minutes} minutes`;
  return delta < 0 ? `Overdue ${value}` : `Remains ${value}`;
}

function formatDateTime(value) {
  if (!value) return "No DDL";
  return value.toLocaleString("zh-CN", { hour12: false });
}

function todoSortTime(todo) {
  return todo.end_time ? todo.end_time.getTime() : Number.POSITIVE_INFINITY;
}

function formatDueLine(endTime, now = new Date()) {
  if (!endTime) return "No DDL";
  return `${timeLeft(endTime, now)} (DDL ${formatDateTime(endTime)})`;
}

function expandActiveSemesterIds(semesters = []) {
  const activeSemesterIds = semesters
    .filter((semester) => semester.is_active)
    .flatMap((semester) => [semester.id, semester.id + 1, semester.id + 2]);

  return [...new Set(activeSemesterIds)];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry(fn, { attempts = 2, delayMs = 1200 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(delayMs);
    }
  }
  throw lastError;
}

async function getCoursesZjuTodos() {
  const courses = new COURSES(
    new ZJUAM(process.env.ZJU_USERNAME, process.env.ZJU_PASSWORD)
  );

  const semestersResp = await courses.fetch(
    "https://courses.zju.edu.cn/api/my-semesters?fields=id,name,sort,is_active,code"
  );
  const { semesters } = await semestersResp.json();
  const activeSemesterIds = expandActiveSemesterIds(semesters);

  const coursesFetchParam = new URLSearchParams();
  coursesFetchParam.set("page", "1");
  coursesFetchParam.set("page_size", "1000");
  coursesFetchParam.set("sort", "all");
  coursesFetchParam.set("normal", '{"version":7,"apiVersion":"1.1.0"}');
  coursesFetchParam.set(
    "conditions",
    JSON.stringify({
      role: [],
      semester_id: activeSemesterIds,
      academic_year_id: [],
      status: ["ongoing", "notStarted"],
      course_type: [],
      effectiveness: [],
      published: [],
      display_studio_list: false,
    })
  );
  coursesFetchParam.set("fields", "id,name,course_code");

  const coursesResp = await courses.fetch(
    "https://courses.zju.edu.cn/api/my-courses?" + coursesFetchParam.toString()
  );
  const { courses: courseList } = await coursesResp.json();
  const uniqueCourseList = [
    ...new Map((courseList || []).map((course) => [course.id, course])).values(),
  ];

  const now = new Date();
  const todos = [];

  await Promise.all(
    uniqueCourseList.map(async (course) => {
      const isActive = (item) => {
        if (!item.published) return false;
        if (!item.end_time) return false;
        if (new Date(item.end_time) <= now) return false;
        if (item.start_time && new Date(item.start_time) > now) return false;
        return true;
      };

      const [
        { activities },
        { exams },
        { homework_activities: homeworkActivities },
        { exam_ids: submittedExamIds },
        { classrooms },
      ] = await Promise.all([
        courses.fetch(`https://courses.zju.edu.cn/api/courses/${course.id}/activities`).then((r) => r.json()).catch(() => ({ activities: [] })),
        courses.fetch(`https://courses.zju.edu.cn/api/courses/${course.id}/exams`).then((r) => r.json()).catch(() => ({ exams: [] })),
        courses.fetch(`https://courses.zju.edu.cn/api/course/${course.id}/homework/submission-status?no-intercept=true`).then((r) => r.json()).catch(() => ({ homework_activities: [] })),
        courses.fetch(`https://courses.zju.edu.cn/api/courses/${course.id}/submitted-exams?no-intercept=true`).then((r) => r.json()).catch(() => ({ exam_ids: [] })),
        courses.fetch(`https://courses.zju.edu.cn/api/courses/${course.id}/classroom-list`).then((r) => r.json()).catch(() => ({ classrooms: [] })),
      ]);

      const submittedHomeworkIds = new Set(
        (homeworkActivities || [])
          .filter((homework) => homework.status_code === "submitted")
          .map((homework) => homework.id)
      );
      const submittedExamIdSet = new Set(submittedExamIds || []);

      for (const activity of activities || []) {
        if (!isActive(activity)) continue;
        if (activity.type === "homework" && submittedHomeworkIds.has(activity.id)) continue;
        if (activity.completion_criterion_key === "score" && parseFloat(activity.score_percentage) >= 1) continue;
        todos.push({
          title: activity.title,
          course_name: course.name,
          course_id: course.id,
          id: activity.id,
          end_time: new Date(activity.end_time),
          type: activity.type,
          source: "courses.zju",
        });
      }

      for (const exam of exams || []) {
        if (!isActive(exam)) continue;
        if (submittedExamIdSet.has(exam.id)) continue;
        todos.push({
          title: exam.title,
          course_name: course.name,
          course_id: course.id,
          id: exam.id,
          end_time: new Date(exam.end_time),
          type: "quiz",
          source: "courses.zju",
        });
      }

      for (const classroom of classrooms || []) {
        if (classroom.status !== "start") continue;
        if (classroom.start_at && new Date(classroom.start_at) > now) continue;
        if (classroom.end_at && new Date(classroom.end_at) <= now) continue;
        todos.push({
          title: classroom.title,
          course_name: course.name,
          course_id: course.id,
          id: classroom.id,
          end_time: classroom.end_at ? new Date(classroom.end_at) : null,
          type: "interaction",
          source: "courses.zju",
        });
      }
    })
  );

  return todos;
}

async function getCoursesApiTodos() {
  const courses = new COURSES(
    new ZJUAM(process.env.ZJU_USERNAME, process.env.ZJU_PASSWORD)
  );
  const resp = await courses
    .fetch("https://courses.zju.edu.cn/api/todos")
    .then((response) => response.json());
  const now = new Date();

  return (resp.todo_list || [])
    .filter((todo) => !todo.end_time || new Date(todo.end_time) > now)
    .map((todo) => ({
      title: todo.title,
      course_name: todo.course_name,
      course_id: todo.course_id,
      id: todo.id,
      end_time: todo.end_time ? new Date(todo.end_time) : null,
      type: todo.type || "todo",
      source: "courses.zju",
    }));
}

async function getCoursesTodosWithFallback() {
  try {
    const todos = await withRetry(() => getCoursesZjuTodos());
    return { todos, warnings: [] };
  } catch (error) {
    const reliableError = error?.message || String(error);
    try {
      const todos = await withRetry(() => getCoursesApiTodos());
      return {
        todos,
        warnings: [`学在浙大可靠待办获取失败，已回退 /api/todos: ${reliableError}`],
      };
    } catch (fallbackError) {
      throw new Error(
        `学在浙大待办获取失败: ${reliableError}; /api/todos 回退失败: ${fallbackError?.message || fallbackError}`
      );
    }
  }
}

async function fetchPintiaProblemSets(cookie, filter) {
  return axios.get("https://pintia.cn/api/problem-sets", {
    params: {
      filter,
      limit: 100,
      order_by: "END_AT",
      asc: true,
    },
    headers: {
      Accept: "application/json;charset=UTF-8",
      "Accept-Language": "zh-CN",
      Cookie: cookie,
      Referer: "https://pintia.cn/problem-sets/dashboard",
    },
    validateStatus: () => true,
  });
}

async function getPintiaTodos() {
  const cookie = process.env.PINTIA_COOKIE?.trim();
  if (!cookie) return [];

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setUTCHours(0, 0, 0, 0);
  const filter = JSON.stringify({ endAtAfter: yesterday.toISOString() });

  const psResp = await fetchPintiaProblemSets(cookie, filter);
  if (psResp.status !== 200) {
    throw new Error(
      `[pintia] 获取作业列表失败 (${psResp.status}): ${JSON.stringify(psResp.data)}`
    );
  }

  const { problemSets = [] } = psResp.data || {};
  const now = new Date();

  return problemSets
    .filter((problemSet) => problemSet.endAt && new Date(problemSet.endAt) > now)
    .map((problemSet) => ({
      title: problemSet.name,
      course_name: problemSet.organizationName || problemSet.ownerNickname || "pintia",
      id: problemSet.id,
      end_time: new Date(problemSet.endAt),
      source: "pintia",
    }));
}

async function getReliableTodos() {
  const results = await Promise.allSettled([
    getCoursesTodosWithFallback(),
    getPintiaTodos().then((todos) => ({ todos, warnings: [] })),
  ]);
  const errors = [];
  const todos = [];

  for (const result of results) {
    if (result.status === "rejected") {
      errors.push(result.reason?.message || String(result.reason));
    } else {
      todos.push(...result.value.todos);
      errors.push(...result.value.warnings);
    }
  }

  todos.sort((a, b) => todoSortTime(a) - todoSortTime(b));
  return { todos, errors };
}

export {
  formatDateTime,
  formatDueLine,
  getCoursesApiTodos,
  getCoursesZjuTodos,
  getPintiaTodos,
  getReliableTodos,
  timeLeft,
  todoSortTime,
};
