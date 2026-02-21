const app = require("./app");

const port = Number(process.env.PORT || 8787);
app.listen(port, () => {
  console.log(`Payment server running on port ${port}`);
});
