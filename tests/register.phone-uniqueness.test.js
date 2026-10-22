const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

require("dotenv").config();

const DUPLICATE_PHONE_MESSAGE =
  "This mobile number is already registered. Please use another number.";

const TEST_DB_NAME = process.env.TEST_DB_NAME || "upleex_test";

// The tests never touch the production database, they run against a separate
// database on the same cluster.
const buildTestUrl = (url) => {
  if (!url) {
    throw new Error("MONGO_URL is not set");
  }

  const [withoutQuery, query] = url.split("?");

  const lastSlash = withoutQuery.lastIndexOf("/");

  return `${withoutQuery.slice(0, lastSlash + 1)}${TEST_DB_NAME}${
    query ? `?${query}` : ""
  }`;
};

const MONGO_URL =
  process.env.TEST_MONGO_URL || buildTestUrl(process.env.MONGO_URL);

let app;
let server;
let baseUrl;
let User;

// Legacy users that share a mobile number, they represent the documents that
// already existed before the unique index was added.
const LEGACY_USERS = [
  { name: "Legacy One", email: "legacy.one@example.com", phoneNumber: "1111111111" },
  { name: "Legacy Two", email: "legacy.two@example.com", phoneNumber: "1111111111" },
  { name: "Legacy Three", email: "legacy.three@example.com", phoneNumber: "6353479616" },
  { name: "Legacy Four", email: "legacy.four@example.com", phoneNumber: "9696457852" },
];

const register = async (body) => {
  const response = await fetch(`${baseUrl}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return { status: response.status, body: await response.json() };
};

const buildRegistration = (overrides = {}) => ({
  name: "Test User",
  email: `test.${Date.now()}.${Math.random().toString(16).slice(2)}@example.com`,
  password: "Password@123",
  phoneNumber: "9876543210",
  ...overrides,
});

const LEGACY_EMAILS = LEGACY_USERS.map((user) => user.email);

const removeTestDocuments = async () => {
  const collection = mongoose.connection.db.collection("users");

  await collection.deleteMany({
    $or: [
      { email: { $in: LEGACY_EMAILS } },
      { email: { $regex: "^test\\." } },
    ],
  });
};

test.before(async () => {
  await mongoose.connect(MONGO_URL);

  const UserModel = require("../model/User");
  const appModule = require("../app");

  app = appModule;
  User = UserModel;

  // Start from an empty test database, the production database is never
  // used by the tests.
  await removeTestDocuments();

  // The legacy documents are inserted without the phoneUnique marker, the
  // same way they were stored before the rule was added.
  await mongoose.connection.db.collection("users").insertMany(
    LEGACY_USERS.map((user) => ({
      ...user,
      password: "hashed-password",
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
  );

  // The unique index has to be created even though the collection already
  // contains duplicate mobile numbers.
  await User.createIndexes();

  server = app.listen(0);

  await new Promise((resolve) => server.once("listening", resolve));

  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }

  if (mongoose.connection.readyState !== 0) {
    await removeTestDocuments();

    const indexes = await mongoose.connection.db
      .collection("users")
      .indexes();

    const phoneIndex = indexes.find(
      (index) => index.name === "phoneNumber_unique_enforced",
    );

    if (phoneIndex) {
      await mongoose.connection.db
        .collection("users")
        .dropIndex("phoneNumber_unique_enforced");
    }

    await mongoose.disconnect();
  }
});

test("the unique index is created although legacy users share a mobile number", async () => {
  const indexes = await mongoose.connection.db.collection("users").indexes();

  const phoneIndex = indexes.find(
    (index) => index.name === "phoneNumber_unique_enforced",
  );

  assert.ok(phoneIndex, "the phone number index is missing");
  assert.equal(phoneIndex.unique, true);
  assert.deepEqual(phoneIndex.partialFilterExpression, { phoneUnique: true });
});

test("a user with a new mobile number is registered", async () => {
  const result = await register(
    buildRegistration({ phoneNumber: "9876543210" }),
  );

  assert.equal(result.status, 201);
  assert.equal(result.body.user.phoneNumber, "9876543210");
});

test("the same mobile number is rejected the second time", async () => {
  const result = await register(
    buildRegistration({ phoneNumber: "9876543210" }),
  );

  assert.equal(result.status, 409);
  assert.equal(result.body.message, DUPLICATE_PHONE_MESSAGE);
  assert.equal(result.body.errors.phoneNumber, DUPLICATE_PHONE_MESSAGE);
});

test("a mobile number of a legacy user is rejected", async () => {
  const result = await register(
    buildRegistration({ phoneNumber: "1111111111" }),
  );

  assert.equal(result.status, 409);
  assert.equal(result.body.message, DUPLICATE_PHONE_MESSAGE);
  assert.equal(result.body.errors.phoneNumber, DUPLICATE_PHONE_MESSAGE);
});

test("a different mobile number is still registered", async () => {
  const result = await register(
    buildRegistration({ phoneNumber: "9123456780" }),
  );

  assert.equal(result.status, 201);
  assert.equal(result.body.user.phoneNumber, "9123456780");
});

test("concurrent registrations of the same mobile number create a single user", async () => {
  const phoneNumber = "9555555555";

  const results = await Promise.all(
    Array.from({ length: 5 }, () => register(buildRegistration({ phoneNumber }))),
  );

  const created = results.filter((result) => result.status === 201);
  const rejected = results.filter((result) => result.status === 409);

  assert.equal(created.length, 1, "exactly one registration may succeed");
  assert.equal(rejected.length, 4);

  rejected.forEach((result) => {
    assert.equal(result.body.message, DUPLICATE_PHONE_MESSAGE);
    assert.equal(result.body.errors.phoneNumber, DUPLICATE_PHONE_MESSAGE);
  });

  const usersWithNumber = await mongoose.connection.db
    .collection("users")
    .countDocuments({ phoneNumber });

  assert.equal(usersWithNumber, 1);
});

test("the legacy users are not changed by the registration", async () => {
  const legacyUsers = await mongoose.connection.db
    .collection("users")
    .find({ email: { $in: LEGACY_USERS.map((user) => user.email) } })
    .toArray();

  assert.equal(legacyUsers.length, LEGACY_USERS.length);

  legacyUsers.forEach((user) => {
    assert.equal(user.phoneUnique, undefined);
  });

  const duplicateLegacy = await mongoose.connection.db
    .collection("users")
    .countDocuments({ phoneNumber: "1111111111" });

  assert.equal(duplicateLegacy, 2, "the legacy duplicates are still there");
});
