const holidayModal = require("../models/holidayModal");
async function isHoliday(date) {
  const holidayDate = new Date(date);
  holidayDate.setUTCHours(0, 0, 0, 0);

  // Fetch all holidays from the database
  const holidays = await holidayModal.find({});

  // Check if the date is in the holiday database
  let holiday = holidays.some((holiday) => {
    const dbHolidayDate = new Date(holiday.date);
    dbHolidayDate.setUTCHours(0, 0, 0, 0);
    return dbHolidayDate.getTime() === holidayDate.getTime();
  });
  if (!holiday) {
    const month = holidayDate.getMonth();
    const day = holidayDate.getDate();
    const dayOfWeek = holidayDate.getDay();

    holiday =
      (month === 5 && day === 30) || // June 30
      dayOfWeek === 5 || // Every Friday
      (dayOfWeek === 6 && holidayDate <= new Date("2024-07-09")) || 
      (holidayDate >= new Date("2024-06-16") &&
        holidayDate <= new Date("2024-06-20")) || // June 16 to June 20, 2024
      holidayDate.getTime() === new Date("2024-07-11").getTime(); // July 11, 2024
  }

  console.log("holiday", holiday);
  return !!holiday;
}

const getCurrentEgyptTime = () => {
  const today = new Date();
  const options = {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false, // Use 24-hour format
  };

  const formatter = new Intl.DateTimeFormat("en-GB", options);
  const [
    { value: day },
    ,
    { value: month },
    ,
    { value: year },
    ,
    { value: hour },
    ,
    { value: minute },
    ,
    { value: second },
  ] = formatter.formatToParts(today);

  const egyptTime = new Date().toLocaleString("en-US", {
    timeZone: "Africa/Cairo",
  });
  const [datePart, timePart] = egyptTime.split(", ");
  const [egyptMonth, egyptDay, egyptYear] = datePart.split("/");
  const [egyptHour, egyptMinute, egyptSecond] = timePart.split(":");

  const formattedDate = `${egyptYear}-${egyptMonth.padStart(
    2,
    "0"
  )}-${egyptDay.padStart(2, "0")}T${egyptHour.padStart(
    2,
    "0"
  )}:${egyptMinute.padStart(2, "0")}:${egyptSecond
    .split(" ")[0]
    .padStart(2, "0")}.${today.getMilliseconds().toString().padStart(3, "0")}Z`;
  return formattedDate;
};

const calculateWorkHoursInMinutes = (checkInTime, checkOutTime) => {
  if (!checkInTime || !checkOutTime) return 0;
  const checkIn = new Date(checkInTime);
  const checkOut = new Date(checkOutTime);
  const diffMs = checkOut - checkIn;
  return Math.floor(diffMs / 1000 / 60);
};
function isWithinWorkingHours(dateString) {
  const inputDate = new Date(dateString);
  const currentDate = new Date();

  const isToday =
    inputDate.getUTCFullYear() === currentDate.getUTCFullYear() &&
    inputDate.getUTCMonth() === currentDate.getUTCMonth() &&
    inputDate.getUTCDate() === currentDate.getUTCDate();

  if (!isToday) {
    return false;
  }

  const startHour = 5;
  const endHour = 20;

  const inputHour = inputDate.getUTCHours();

  const isWithinHours = inputHour >= startHour && inputHour < endHour;
  return isWithinHours;
}

const getAttendanceStatus = (todaysAttendance, currentTime) => {
  const today = new Date();
  today.setDate(today.getDate() - 0);
  today.setUTCHours(0, 0, 0, 0);
  let status = "Absent without Reason";
  let absentReason = "";
  let checkInTime = "";
  let checkOutTime = "";
  let workHours = 0;
  let absentTime = "";
  let checkInLocation = {};
  let checkOutLocation = {};
  let absentLocation = {};
  const startOfWorkDay = new Date(currentTime);
  startOfWorkDay.setHours(0, 0, 0, 0);
  const endOfWorkDay = new Date(currentTime);
  endOfWorkDay.setHours(23, 59, 59, 999);

  if (todaysAttendance) {
    let isWithinHours = isWithinWorkingHours(todaysAttendance.date);
    if (todaysAttendance.isAbsent) {
      if (!todaysAttendance.checkIn && todaysAttendance.absentReason) {
        status = "Absent with Reason";
        absentTime = todaysAttendance.absentTime;
        absentReason = todaysAttendance.absentReason;
        absentLocation = todaysAttendance.absentLocation;
      } else {
        absentTime = todaysAttendance.absentTime;
        status = "Absent without Reason";
      }
    } else if (todaysAttendance.checkIn && todaysAttendance.notCompleteDay) {
      status = "Day not completed";
      checkInTime = todaysAttendance.checkIn;
      absentTime = todaysAttendance.absentTime;
      checkInLocation = todaysAttendance.checkInLocation;
      checkOutTime = todaysAttendance.absentTime;
      checkOutLocation = todaysAttendance.checkOutLocation;
      workHours = calculateWorkHoursInMinutes(
        todaysAttendance.checkIn,
        todaysAttendance.absentTime
      );
      absentReason = todaysAttendance.absentReason;
    } else if (todaysAttendance.workMeeting && todaysAttendance.absentTime) {
      status = "workMeeting";
      checkInTime = todaysAttendance.checkIn;
      checkInLocation = todaysAttendance.checkInLocation;
      absentReason = todaysAttendance.absentReason;
      absentTime = todaysAttendance.absentTime;
    } else if (todaysAttendance.willBeLate && todaysAttendance.absentTime) {
      status = "willBeLate";
      checkInTime = todaysAttendance.checkIn;
      checkInLocation = todaysAttendance.checkInLocation;
      absentReason = todaysAttendance.absentReason;
      absentTime = todaysAttendance.absentTime;
    } else if (
      todaysAttendance.checkIn &&
      !todaysAttendance.checkOut &&
      isWithinWorkingHours(todaysAttendance.date)
    ) {
      status = "Pending";
      checkInTime = todaysAttendance.checkIn;
      checkInLocation = todaysAttendance.checkInLocation;
      absentTime = todaysAttendance.absentTime || null;
      absentReason = todaysAttendance.absentReason || "";
    } else if (todaysAttendance.checkIn && todaysAttendance.checkOut) {
      status = "Completed";
      checkInTime = todaysAttendance.checkIn;
      checkOutTime = todaysAttendance.checkOut;
      absentTime = todaysAttendance.absentTime || null;
      absentReason = todaysAttendance.absentReason || "";
      workHours = calculateWorkHoursInMinutes(
        todaysAttendance.checkIn,
        todaysAttendance.checkOut
      );
      checkInLocation = todaysAttendance.checkInLocation;
      checkOutLocation = todaysAttendance.checkOutLocation;
    } else if (
      todaysAttendance.checkIn &&
      !todaysAttendance.checkOut &&
      currentTime >= startOfWorkDay &&
      currentTime <= endOfWorkDay
    ) {
      status = "Canceled";
      cancelReason = "Did Not Check Out";
      checkInTime = todaysAttendance.checkIn;
      checkInLocation = todaysAttendance.checkInLocation;
    }
  } else {
    status = "Absent without Reason";
  }

  return {
    status,
    absentLocation,
    absentReason,
    checkInTime,
    checkOutTime,
    workHours,
    checkInLocation,
    absentTime,
    checkOutLocation,
  };
};

module.exports = { getAttendanceStatus, getCurrentEgyptTime, isHoliday };
