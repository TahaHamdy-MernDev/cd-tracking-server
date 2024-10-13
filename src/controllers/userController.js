const { DateTime } = require("luxon");
const dailyReportModel = require("../models/dailyReportModel");
const monthlyReportModel = require("../models/monthlyReportModel");
const userModel = require("../models/userModel");
const asyncHandler = require("../utils/asyncHandler");
const { getAttendanceStatus, isHoliday } = require("../utils/common");
const dbService = require("../utils/dbService");
const moment = require("moment");
const bcrypt = require("bcrypt");
const mongoose = require("mongoose");
const holidayModal = require("../models/holidayModal");
const { generateDailyReport } = require("../utils/scheduler");
const getTodayDate = () => new Date().setHours(0, 0, 0, 0);

// const findUserById = async (userId, res) => {
//   const user = await dbService.findOne(userModel, { _id: userId });
//   if (!user) {
//     return res.recordNotFound({ message: "هذا الموظف غير موجود" });
//   }
//   return user;
// };

const findTodaysAttendance = (user) => {
  const today = getTodayDate();
  return user.attendance.find((record) => {
    const recordDate = new Date(record.date).setHours(0, 0, 0, 0);
    return recordDate === today;
  });
};

const isUserInDailyReports = async (userId) => {
  const dailyReport = await dailyReportModel.findOne({
    "reports.userId": userId,
  });
  return !!dailyReport;
};

const isUserInMonthlyReports = async (userId) => {
  const monthlyReport = await monthlyReportModel.findOne({
    "reports.userId": userId,
  });
  return !!monthlyReport;
};

const removeFromDailyReports = async (userId) => {
  await dailyReportModel.updateMany(
    { "reports.userId": userId },
    { $pull: { reports: { userId: userId } } }
  );
};

const removeFromMonthlyReports = async (userId) => {
  await monthlyReportModel.updateMany(
    { "reports.userId": userId },
    { $pull: { reports: { userId: userId } } }
  );
};
exports.checkIn = asyncHandler(async (req, res) => {
  const user = await dbService.findOne(userModel, { _id: req.user.id });
  if (!user) {
    return res.recordNotFound({ message: "هذا الموظف غير موجود" });
  }
  const attendance = findTodaysAttendance(user);

  if (attendance) {
    if (
      attendance.isAbsent &&
      (!attendance.workMeeting || !attendance.willBeLate)
    ) {
      return res.badRequest({ message: "تم وضع علامة كغياب بالفعل" });
    } else if (attendance.checkOut) {
      return res.badRequest({ message: "تم تسجيل الانصراف بالفعل" });
    } else if (attendance.absentTime && !attendance.checkIn) {
      attendance.workMeeting = false;
      attendance.willBeLate = false;
      attendance.isAbsent = false;
      attendance.checkInLocation = req.body.location;
      attendance.checkIn = new Date();
      await attendance.save({ suppressWarning: true });
      await user.save();
      return res.success({ message: "تم تسجيل الحضور بنجاح." });
    } else if (attendance.checkIn) {
      return res.badRequest({ message: "تم تسجيل الحضور بالفعل." });
    }
  } else {
    user.attendance.push({
      date: new Date(),
      checkIn: new Date(),
      checkInLocation: req.body.location,
      isAbsent: !!req.body.absentReason,
      absentReason: req.body.absentReason || "",
      absentLocation: req.body.location || {},
      workMeeting: req.body.workMeeting || false,
      willBeLate: req.body.willBeLate || false,
    });
  }

  await user.save();
  return res.success({ data: user });
});

exports.checkOut = asyncHandler(async (req, res) => {
  const user = await dbService.findOne(userModel, { _id: req.user.id });
  if (!user) {
    return res.recordNotFound({ message: "هذا الموظف غير موجود" });
  }
  const todaysAttendance = findTodaysAttendance(user);

  if (!todaysAttendance) {
    return res.badRequest({ message: "لا يوجد سجل حضور لهذا اليوم" });
  } else if (todaysAttendance.isAbsent) {
    return res.badRequest({ message: "تم وضع علامة كغياب بالفعل" });
  } else if (todaysAttendance.checkOut) {
    return res.badRequest({ message: "تم تسجيل الانصراف بالفعل" });
  }

  const checkOutTime = new Date();

  Object.assign(todaysAttendance, {
    checkOut: checkOutTime,
    checkOutLocation: req.body.location,
    workMeeting: false,
    willBeLate: false,
  });

  await user.save();
  return res.success({ data: user });
});

exports.markAbsence = asyncHandler(async (req, res) => {
  const user = await dbService.findOne(userModel, { _id: req.user.id });
  if (!user) {
    return res.recordNotFound({ message: "هذا الموظف غير موجود" });
  }

  const today = new Date();
  const todaysAttendance = user.attendance.find((record) =>
    moment(record.date).isSame(today, "day")
  );
  let absent = true;
  if (req.body.workMeeting) {
    absent = false;
  } else if (req.body.willBeLate) {
    absent = false;
  } else if (req.body.notCompleteDay) {
    absent = false;
  }

  if (todaysAttendance) {
    if (todaysAttendance.checkIn && !todaysAttendance.checkOut) {
      if (
        todaysAttendance.isAbsent &&
        todaysAttendance.absentReason &&
        (!todaysAttendance.workMeeting || !todaysAttendance.willBeLate)
      ) {
        return res.badRequest({ message: "تم اخذ اذن بالفعل" });
      } else {
        Object.assign(todaysAttendance, {
          absentTime: new Date(),
          checkOutLocation: req.body.location,
          isAbsent: absent,
          absentReason: req.body.absentReason,
          absentLocation: req.body.location,
          workMeeting: req.body.workMeeting || false,
          willBeLate: req.body.willBeLate || false,
          notCompleteDay: req.body.notCompleteDay || false,
        });
      }
    } else {
      return res.badRequest({ message: "لا يمكن أخذ إذن بعد انتهاء الدوام" });
    }
  } else {
    user.attendance.push({
      date: today,
      isAbsent: absent,
      absentTime: new Date(),
      absentReason: req.body.absentReason,
      absentLocation: req.body.location,
      workMeeting: req.body.workMeeting || false,
      willBeLate: req.body.willBeLate || false,
    });
  }

  await user.save();
  return res.success({ data: user });
});
exports.setHoliday = asyncHandler(async (req, res) => {
  const { date } = req.query;

  if (!date) {
    return res.badRequest({ message: "Date is required" });
  }

  const holidayDate = new Date(date);
  holidayDate.setUTCHours(0, 0, 0, 0);
  const existingHoliday = await holidayModal.findOne({ date: holidayDate });

  if (existingHoliday) {
    return res.badRequest({
      message: "This date is already marked as a holiday",
    });
  }

  const holiday = new holidayModal({ date: holidayDate });
  await holiday.save();
  return res.success({ message: "Holiday set successfully" });
});

exports.getTodaysLiveData = asyncHandler(async (req, res) => {
  const currentTime = DateTime.now();
  const startOfWorkDay = new Date(currentTime);
  startOfWorkDay.setHours(0, 0, 0, 0);
  const endOfWorkDay = new Date(currentTime);
  endOfWorkDay.setHours(23, 59, 59, 999);
  let today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // today = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  const users = await dbService.findMany(userModel, {
    role: { $ne: "admin" },
  });
  const usersCustomFields = await Promise.all(
    users.map(async (user) => {
      const todaysAttendance = findTodaysAttendance(user);
      let {
        status,
        absentReason,
        checkInTime,
        absentLocation,
        checkOutTime,
        workHours,
        checkInLocation,
        checkOutLocation,
        absentTime,
      } = getAttendanceStatus(todaysAttendance, currentTime);
      const {
        totalAbsenceCount,
        totalAbsenceWithReasonCount,
        totalCheckInCount,
      } = user.calculateAttendanceStats();

      if (
        currentTime >= startOfWorkDay &&
        currentTime <= endOfWorkDay &&
        status === "Absent without Reason"
      ) {
        status = "User didn't start the day";
      }

      console.log("today", today);
      if (await isHoliday(today)) {
        status = "Holiday";
      }

      const data = {
        _id: user._id,
        uniqueNumber: user.uniqueNumber,
        companyBranch: user.companyBranch,
        username: user.username,
        checkInTime,
        checkInLocation,
        checkOutTime,
        checkOutLocation,
        workHours,
        status,
        absentReason,
        absentTime,
        totalCheckInCount,
        totalAbsenceCount,
        totalAbsenceWithReasonCount,
      };
      return data;
    })
  );

  return res.success({ data: usersCustomFields });
});

exports.getReportsWithPagination = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const dateParam = req.query.date;
  const targetDate = DateTime.fromISO(dateParam, { zone: "UTC" })
    .set({ hour: 0, minute: 0, second: 0, millisecond: 0 })
    .toISO();

  if (isNaN(Date.parse(targetDate))) {
    return res.status(400).json({ message: "Invalid date format" });
  }
  const validUsers = await userModel
    .find({ createdAt: { $lte: targetDate } })
    .select("_id");
  const userIds = validUsers.map((user) => user._id);

  const dailyReports = await dailyReportModel
    .find({ date: targetDate, "reports.userId": { $in: userIds } })
    .sort({ date: -1 });

  if (!dailyReports.length) {
    return res
      .status(404)
      .json({ message: "No reports found for the specified date" });
  }

  const totalReports = await dailyReportModel.countDocuments({
    date: targetDate,
    "reports.userId": { $in: userIds },
  });
  const totalPages = Math.ceil(totalReports / limit);

  return res.status(200).json({
    data: {
      dailyReports,
      pagination: {
        totalReports,
        totalPages,
        currentPage: page,
        pageSize: limit,
      },
    },
  });
});

exports.getAvailableDates = asyncHandler(async (req, res) => {
  const availableDates = await dailyReportModel.distinct("date");
  res.success({ data: availableDates });
});

exports.getMonthlyReport = asyncHandler(async (req, res) => {
  await generateDailyReport();
  const monthParam = req.query.month; // Expecting month in 'YYYY-MM' format

  if (!/^\d{4}-\d{2}$/.test(monthParam)) {
    return res.badRequest({ message: "Invalid month format" });
  }

  const monthlyReport = await monthlyReportModel.findOne({ month: monthParam });

  if (!monthlyReport) {
    return res.recordNotFound({
      message: "No report found for the specified month",
    });
  }

  return res.success({ data: monthlyReport.reports });
});

exports.getUser = asyncHandler(async (req, res) => {
  const user = await dbService.findOne(userModel, { _id: req.params.id });
  if (!user) {
    return res.recordNotFound({ message: "هذا الموظف غير موجود" });
  }

  return res.success({ data: user });
});

exports.updateUser = asyncHandler(async (req, res) => {
  const userId = req.params.id;
  const { phoneNumber, password, ...updateData } = req.body;

  const user = await dbService.findOne(userModel, { _id: userId });
  if (!user) {
    return res.recordNotFound({ message: "هذا الموظف غير موجود" });
  }
  if (phoneNumber) {
    const userExists = await dbService.findOne(userModel, {
      phoneNumber,
      _id: { $ne: userId },
    });
    if (userExists) {
      return res.badRequest({ message: "رقم الهاتف هذا مستخدم بالفعل." });
    }
    updateData.phoneNumber = phoneNumber;
  }
  if (password) {
    const salt = await bcrypt.genSalt(12);
    updateData.password = await bcrypt.hash(password, salt);
  }

  await dbService.updateOne(userModel, { _id: userId }, { ...updateData });
  await user.save();
  return res.success({ message: "تم تحديث الموظف بنجاح" });
});

exports.deleteUser = asyncHandler(async (req, res) => {
  const userId = req.params.id;
  const user = await dbService.findOne(userModel, { _id: userId });
  if (!user) {
    return res.recordNotFound({ message: "هذا الموظف غير موجود" });
  }
  const userInDailyReports = await isUserInDailyReports(userId);
  const userInMonthlyReports = await isUserInMonthlyReports(userId);
  if (userInDailyReports) {
    await removeFromDailyReports(userId);
  }
  if (userInMonthlyReports) {
    await removeFromMonthlyReports(userId);
  }

  await userModel.deleteOne({ _id: userId });
  return res.success({ message: "تم حذف الموظف بنجاح" });
});

exports.getSortedReportsByStatus = asyncHandler(async (req, res) => {
  const userId = req.params.id;
  const monthParam = req.query.month;

  // Validate month format
  if (!/^\d{4}-\d{2}$/.test(monthParam)) {
    return res.status(400).json({ message: "Invalid month format" });
  }

  // Calculate date range for the given month
  const startDate = new Date(`${monthParam}-01`);
  const endDate = new Date(
    startDate.getFullYear(),
    startDate.getMonth() + 1,
    0
  );

  const reports = await dailyReportModel.aggregate([
    { $unwind: "$reports" },
    {
      $match: {
        "reports.userId": new mongoose.Types.ObjectId(userId),
        date: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $project: {
        _id: 0,
        date: "$date",
        reports: {
          $mergeObjects: ["$reports", { date: "$date" }],
        },
      },
    },
    {
      $replaceRoot: { newRoot: "$reports" },
    },
    { $sort: { date: 1, status: 1 } },
  ]);

  res.status(200).json({ data: reports });
});

// exports.changeDayStatusForAllUsers= asyncHandler(async(req,res)=>{
//     const {date} = req.query
//     const users= await dbService.findMany(userModel, {});
//    if(!users.length){
//     return res.recordNotFound({ message: "No users found" });
//    }
//    const targetDate = new Date(date);
//   targetDate.setUTCHours(0, 0, 0, 0);

//   const updatedUsers = await Promise.all(users.map(async (user) => {
//     const attendanceRecord = user.attendance.find(record => {
//       const recordDate = new Date(record.date).setUTCHours(0, 0, 0, 0);
//       return recordDate.getTime() === targetDate.getTime();
//     });
//     if (attendanceRecord) {
//       attendanceRecord.status = newStatus;
//       if (reason) attendanceRecord.absentReason = reason;
//       if (location) attendanceRecord.absentLocation = location;
//     } else {
//       user.attendance.push({
//         date: targetDate,
//         status: newStatus,
//         absentReason: reason,
//         absentLocation: location,
//       });
//     }

//     await user.save();
//     return user;
//   }));

// })
