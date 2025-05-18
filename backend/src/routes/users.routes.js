import { Router } from "express";
import { addToHistory, getUserHistory, login, register } from "../controllers/user.controller.js";
const router = Router();

  router.route("/login").post(login);
  router.route("/register").post(register);
  router.route("/add_to_activity").post(addToHistory);
  router.route("/get_all_activity").get(getUserHistory);
//   router.route("/test").post((req, res) => {
//     console.log("TEST ROUTE HIT");
//     console.log("req.body in test:", req.body);
//     res.json({ test: "OK", body: req.body });
// });

export default router;
