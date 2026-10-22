// Verifies the duplicate mobile number rule against the real database.
//
// It audits the existing data, checks the indexes, registers a user, tries
// to register the same mobile number again, registers a different number and
// fires a burst of parallel registrations for one number. Every user that
// the script creates is removed again, no existing user is touched.

require("dotenv").config();

const mongoose = require("mongoose");

const DUPLICATE_PHONE_MESSAGE =
  "This mobile number is already registered. Please use another number.";

const results = [];

const report = (name, passed, details) => {
  results.push({ name, passed, details });

  console.log(`${passed ? "PASS" : "FAIL"} | ${name} | ${details}`);
};

const register = async (baseUrl, body) => {
  const response = await fetch(`${baseUrl}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return { status: response.status, body: await response.json() };
};

const buildRegistration = (phoneNumber, tag) => ({
  name: `Phone Check ${tag}`,
  email: `phone.check.${tag}.${Date.now()}@example.com`,
  password: "Password@123",
  phoneNumber,
});

const main = async () => {
  await mongoose.connect(process.env.MONGO_URL);

  const collection = mongoose.connection.db.collection("users");

  // ==================== 1. AUDIT ====================
  const users = await collection.find({}).toArray();

  const phoneCount = new Map();

  users.forEach((user) => {
    const phone = String(user.phoneNumber || "").trim();

    phoneCount.set(phone, (phoneCount.get(phone) || 0) + 1);
  });

  const duplicates = [...phoneCount.entries()].filter(([, count]) => count > 1);

  console.log(`\nAudit of the users collection (${users.length} users)`);
  console.log(`Duplicate mobile numbers: ${JSON.stringify(duplicates)}`);

  report(
    "existing data is read without changes",
    users.length > 0,
    `${users.length} users found, ${duplicates.length} duplicate number groups`,
  );

  // ==================== 2. INDEXES ====================
  const indexes = await collection.indexes();

  const phoneIndex = indexes.find(
    (index) => index.name === "phoneNumber_unique_enforced",
  );

  console.log(
    `\nIndexes: ${JSON.stringify(indexes.map((index) => index.name))}`,
  );

  report(
    "unique phone index exists on the collection",
    !!phoneIndex && phoneIndex.unique === true,
    phoneIndex
      ? `phoneNumber_unique_enforced, unique=${phoneIndex.unique}, partial=${JSON.stringify(
          phoneIndex.partialFilterExpression,
        )}`
      : "index is missing",
  );

  // ==================== 3. START THE SERVER ====================
  const app = require("../app");

  const server = app.listen(0);

  await new Promise((resolve) => server.once("listening", resolve));

  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  console.log(`\nServer running on ${baseUrl}`);

  const createdEmails = [];

  try {
    // ==================== 4. REGISTER A NEW NUMBER ====================
    const first = await register(baseUrl, buildRegistration("7011223344", "a"));

    if (first.status === 201) {
      createdEmails.push(first.body.user.email);
    }

    report(
      "registration with a new mobile number works",
      first.status === 201,
      `status=${first.status}`,
    );

    // ==================== 5. SAME NUMBER AGAIN ====================
    const second = await register(baseUrl, buildRegistration("7011223344", "b"));

    report(
      "the same mobile number is rejected",
      second.status === 409 &&
        second.body.message === DUPLICATE_PHONE_MESSAGE &&
        second.body.errors?.phoneNumber === DUPLICATE_PHONE_MESSAGE,
      `status=${second.status} message=${JSON.stringify(second.body.message)}`,
    );

    // ==================== 6. A DIFFERENT NUMBER ====================
    const third = await register(baseUrl, buildRegistration("7011223355", "c"));

    if (third.status === 201) {
      createdEmails.push(third.body.user.email);
    }

    report(
      "a different mobile number is still registered",
      third.status === 201,
      `status=${third.status}`,
    );

    // ==================== 7. LEGACY DUPLICATE NUMBER ====================
    const legacyPhone = duplicates.length > 0 ? duplicates[0][0] : null;

    if (legacyPhone) {
      const legacy = await register(
        baseUrl,
        buildRegistration(legacyPhone, "d"),
      );

      report(
        "a mobile number of an existing user is rejected",
        legacy.status === 409 &&
          legacy.body.message === DUPLICATE_PHONE_MESSAGE,
        `status=${legacy.status} message=${JSON.stringify(legacy.body.message)}`,
      );
    }

    // ==================== 8. PARALLEL REGISTRATIONS ====================
    const parallel = await Promise.all(
      Array.from({ length: 5 }, () =>
        register(baseUrl, buildRegistration("7011223366", "e")),
      ),
    );

    const accepted = parallel.filter((item) => item.status === 201);
    const rejected = parallel.filter((item) => item.status === 409);

    accepted.forEach((item) => createdEmails.push(item.body.user.email));

    const stored = await collection.countDocuments({
      phoneNumber: "7011223366",
    });

    report(
      "parallel registrations of one number keep a single user",
      accepted.length === 1 &&
        rejected.length === 4 &&
        rejected.every(
          (item) => item.body.message === DUPLICATE_PHONE_MESSAGE,
        ) &&
        stored === 1,
      `accepted=${accepted.length} rejected=${rejected.length} stored=${stored}`,
    );
  } finally {
    // ==================== 9. CLEANUP ====================
    // Only the users that this script created are removed.
    if (createdEmails.length > 0) {
      await collection.deleteMany({ email: { $in: createdEmails } });
    }

    const remaining = await collection.countDocuments({});

    console.log(
      `\nCleanup done, ${createdEmails.length} test users removed, ${remaining} users left`,
    );

    await new Promise((resolve) => server.close(resolve));

    await mongoose.disconnect();
  }

  const failed = results.filter((result) => !result.passed);

  console.log(
    `\n${results.length - failed.length}/${results.length} checks passed`,
  );

  if (failed.length > 0) {
    process.exitCode = 1;
  }
};

main().catch((error) => {
  console.error("Verification Error:", error);

  process.exitCode = 1;
});
