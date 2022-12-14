const router = require("express").Router();
const eqData = require("../models/equipments");
const assetAvblty = require("../models/assetAvailability");
const findError = require("../utils/errorCodes");
const _ = require("lodash");
const moment = require("moment");
const { eq } = require("lodash");

router.get("/", async (req, res) => {
  try {
    const equipments = await eqData.model.find().populate("vendor");
    res.status(200).send({
      equipments,
      nrecords: equipments.length,
      available: equipments.filter((w) => {
        return (
          (w.eqStatus === "standby" || w.eqStatus === "dispatched") &&
          w.eqOwner === "Construck"
        );
      }).length,
      workshop: equipments.filter((w) => {
        return w.eqStatus === "workshop" && w.eqOwner === "Construck";
      }).length,
      dispatched: equipments.filter((w) => {
        return w.eqStatus === "dispatched" && w.eqOwner === "Construck";
      }).length,
      standby: equipments.filter((w) => {
        return w.eqStatus === "standby" && w.eqOwner === "Construck";
      }).length,

      ct: equipments.filter((w) => {
        return w.eqStatus === "ct" && w.eqOwner === "Construck";
      }).length,
    });
  } catch (err) {}
});

router.get("/v2", async (req, res) => {
  try {
    const equipments = await eqData.model.find().populate("vendor");
    res.status(200).send(equipments);
  } catch (err) {}
});

router.get("/:id", async (req, res) => {
  let { id } = req.params;
  try {
    const equipment = await eqData.model.findById(id).populate("vendor");
    res.status(200).send(equipment);
  } catch (err) {
    res.send(err);
  }
});

router.get("/type/:type", async (req, res) => {
  let { type } = req.params;
  try {
    const equipment = await eqData.model.find({
      eqtype: type,
      eqStatus: "standby",
    });
    res.status(200).send(equipment);
  } catch (err) {
    res.send(err);
  }
});

router.get("/type/:type/:date/:shift", async (req, res) => {
  let { type, date, shift } = req.params;
  try {
    const equipment = await eqData.model.find({
      eqtype: type,
      $or: [
        { eqStatus: "standby" },
        {
          eqStatus: "dispatched",
          assignedShift: { $ne: shift },
          assignedToSiteWork: { $ne: true },
        },
        {
          eqStatus: "dispatched",
          assignedDate: { $ne: date },
          assignedToSiteWork: { $ne: true },
        },
        {
          eqStatus: "dispatched",
          assignedToSiteWork: true,
          assignedShift: { $ne: shift },
        },
      ],
    });
    res.status(200).send(equipment);
  } catch (err) {
    res.send(err);
  }
});

router.get("/:date/:shift", async (req, res) => {
  let { type, date, shift } = req.params;
  try {
    const equipment = await eqData.model.find({
      $or: [
        { eqStatus: "standby" },
        {
          eqStatus: "dispatched",
          assignedShift: { $ne: shift },
          assignedToSiteWork: { $ne: true },
        },
        {
          eqStatus: "dispatched",
          assignedDate: { $ne: date },
          assignedToSiteWork: { $ne: true },
        },
        {
          eqStatus: "dispatched",
          assignedToSiteWork: true,
          assignedShift: { $ne: shift },
        },
      ],
    });
    res.status(200).send(equipment);
  } catch (err) {
    res.send(err);
  }
});

router.post("/", async (req, res) => {
  try {
    eqData.model.findOne(
      {
        plateNumber: req.body.plateNumber,
      },
      async (err, eq) => {
        if (err) console.log(err);
        if (eq) {
          res.send({
            error: "Duplicate key",
            key: "Plate number",
          });
        } else {
          try {
            const eqToCreate = new eqData.model(req.body);
            const eqCreated = await eqToCreate.save();
            res.status(201).send(eqCreated);
          } catch (err) {
            let error = findError(err.code);
            let keyPattern = err.keyPattern;
            let key = _.findKey(keyPattern, function (key) {
              return key === 1;
            });
            res.send({
              error,
              key,
            });
          }
        }
      }
    );
  } catch (err) {
    let error = findError(err.code);
    let keyPattern = err.keyPattern;
    let key = _.findKey(keyPattern, function (key) {
      return key === 1;
    });
    res.send({
      error,
      key,
    });
  }
});

router.put("/makeAvailable/:id", async (req, res) => {
  let { id } = req.params;
  try {
    let equipment = await eqData.model.findById(id);

    equipment.eqStatus = "standby";

    let savedRecord = await equipment.save();

    let today = moment().format("DD-MMM-YYYY");
    const dateData = await assetAvblty.model.findOne({ date: today });
    let availableAssets = await eqData.model.find({
      eqStatus: { $ne: "workshop" },
      eqOwner: "Construck",
    });
    let unavailableAssets = await eqData.model.find({
      eqStatus: "workshop",
      eqOwner: "Construck",
    });
    let dispatched = await eqData.model.find({
      eqStatus: "dispatched",
      eqOwner: "Construck",
    });

    let standby = await eqData.model.find({
      eqStatus: "standby",
      eqOwner: "Construck",
    });

    if (dateData) {
      let currentAvailable = dateData.available;
      let currentUnavailable = dateData.unavailable;
      dateData.available = currentAvailable + 1;
      dateData.unavailable = currentUnavailable - 1;
      dateData.dispatched = dispatched.length;
      dateData.standby = standby.length;

      await dateData.save();
    } else {
      let dateDataToSave = new assetAvblty.model({
        date: today,
        available: availableAssets.length,
        unavailable: unavailableAssets.length,
        dispatched: dispatched.length,
        standby: standby.length,
      });
      await dateDataToSave.save();
    }
    res.status(201).send(savedRecord);
  } catch (err) {
    console.log(err);
  }
});

router.put("/sendToWorkshop/:id", async (req, res) => {
  let { id } = req.params;
  try {
    let equipment = await eqData.model.findById(id);
    equipment.eqStatus = "workshop";
    let savedRecord = await equipment.save();

    let today = moment().format("DD-MMM-YYYY");

    const dateData = await assetAvblty.model.findOne({ date: today });
    let availableAssets = await eqData.model.find({
      eqStatus: { $ne: "workshop" },
      eqOwner: "Construck",
    });

    let unavailableAssets = await eqData.model.find({
      eqStatus: "workshop",
      eqOwner: "Construck",
    });
    let dispatched = await eqData.model.find({
      eqStatus: "dispatched",
      eqOwner: "Construck",
    });

    let standby = await eqData.model.find({
      eqStatus: "standby",
      eqOwner: "Construck",
    });
    if (dateData) {
      let currentAvailable = dateData.available;
      let currentUnavailable = dateData.unavailable;
      dateData.available = currentAvailable - 1;
      dateData.unavailable = currentUnavailable + 1;
      dateData.dispatched = dispatched.length;
      dateData.standby = standby.length;

      await dateData.save();
    } else {
      let dateDataToSave = new assetAvblty.model({
        date: today,
        available: availableAssets.length,
        unavailable: unavailableAssets.length,
        dispatched: dispatched.length,
        standby: standby.length,
      });
      await dateDataToSave.save();
    }
    res.status(201).send(savedRecord);
  } catch (err) {
    console.log(err);
  }
});

router.put("/makeAllAvailable/", async (req, res) => {
  try {
    let equipment = await eqData.model.updateMany({}, { eqStatus: "standby" });
    let today = moment().format("DD-MMM-YYYY");
    const dateData = await assetAvblty.model.findOne({ date: today });
    let availableAssets = await eqData.model.find({
      eqStatus: { $ne: "workshop" },
      eqOwner: "Construck",
    });
    let unavailableAssets = await eqData.model.find({
      eqStatus: "workshop",
      eqOwner: "Construck",
    });
    let dispatched = await eqData.model.find({
      eqStatus: "dispatched",
      eqOwner: "Construck",
    });

    let standby = await eqData.model.find({
      eqStatus: "standby",
      eqOwner: "Construck",
    });

    if (dateData) {
      let currentAvailable = dateData.available;
      let currentUnavailable = dateData.unavailable;
      dateData.available = currentAvailable;
      dateData.unavailable = currentUnavailable;
      dateData.dispatched = dispatched.length;
      dateData.standby = standby.length;

      await dateData.save();
    } else {
      let dateDataToSave = new assetAvblty.model({
        date: today,
        available: availableAssets.length,
        unavailable: unavailableAssets.length,
        dispatched: dispatched.length,
        standby: standby.length,
      });
      await dateDataToSave.save();
    }
    res.status(202).send(equipment);
  } catch (err) {
    console.log(err);
  }
});

router.put("/assignToJob/:id", async (req, res) => {
  let { id } = req.params;
  try {
    let equipment = await eqData.model.findById(id);

    equipment.eqStatus = "dispatched";

    let savedRecord = await equipment.save();

    let today = moment().format("DD-MMM-YYYY");
    const dateData = await assetAvblty.model.findOne({ date: today });
    let availableAssets = await eqData.model.find({
      eqStatus: { $ne: "workshop" },
      eqOwner: "Construck",
    });
    let unavailableAssets = await eqData.model.find({
      eqStatus: "workshop",
      eqOwner: "Construck",
    });
    let dispatched = await eqData.model.find({
      eqStatus: "dispatched",
      eqOwner: "Construck",
    });

    let standby = await eqData.model.find({
      eqStatus: "standby",
      eqOwner: "Construck",
    });

    if (dateData) {
      let currentAvailable = dateData.available;
      let currentUnavailable = dateData.unavailable;
      dateData.available = currentAvailable;
      dateData.unavailable = currentUnavailable;
      dateData.dispatched = dispatched.length;
      dateData.standby = standby.length;

      await dateData.save();
    } else {
      let dateDataToSave = new assetAvblty.model({
        date: today,
        available: availableAssets.length,
        unavailable: unavailableAssets.length,
        dispatched: dispatched.length,
        standby: standby.length,
      });
      await dateDataToSave.save();
    }
    res.status(201).send(savedRecord);
  } catch (err) {
    console.log(err);
  }
});

router.put("/makeDispatched/:id", async (req, res) => {
  let { id } = req.params;
  try {
    let equipment = await eqData.model.findById(id);

    equipment.eqStatus = "dispatched";

    let savedRecord = await equipment.save();
    res.status(201).send(savedRecord);
  } catch (err) {
    console.log(err);
  }
});

router.put("/release/:id", async (req, res) => {
  let { id } = req.params;
  try {
    let equipment = await eqData.model.findById(id);

    equipment.eqStatus = "standby";

    let savedRecord = await equipment.save();
    res.status(201).send(savedRecord);
  } catch (err) {
    console.log(err);
  }
});

router.delete("/hired", async (req, res) => {
  try {
    await eqData.model.deleteMany({ eqOwner: { $ne: "Construck" } });
    res.send("Done");
  } catch (err) {
    console.log(err);
  }
});

router.delete("/ctk", async (req, res) => {
  try {
    await eqData.model.deleteMany({ eqOwner: "Construck" });
    res.send("Done");
  } catch (err) {
    console.log(err);
  }
});

router.put("/resetIndices", async (req, res) => {
  try {
    let update = await eqData.model.updateMany({
      $set: {
        millage: 0,
      },
    });
    res.send(update);
  } catch (err) {}
});

module.exports = router;
