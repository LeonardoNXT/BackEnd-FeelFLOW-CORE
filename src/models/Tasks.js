const mongoose = require("mongoose");

const TasksSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["pending", "complete"],
      default: "pending",
    },
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    steps: {
      type: {
        list: [{ type: String }],
        style: {
          type: String,
          enum: ["not ordered", "ordered"],
          default: "not ordered",
        },
      },
      required: false,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    intendedFor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      default: null,
    },
    archive: {
      type: {
        archive_type: String,
        public_id: String,
        url: String,
      },
      default: null, // permite que não exista
    },
    completionDate: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const taskModel = mongoose.model("Task", TasksSchema);

module.exports = taskModel;
