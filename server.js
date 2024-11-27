const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const {Configuration, OpenAIApi} = require("openai");
// const fetch = require('node-fetch'); // Import node-fetch for API requests.

let fetch;
(async () => {
  fetch = (await import('node-fetch')).default;
})();
const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// MongoDB connection
const uri = 'mongodb+srv://thatsuon:Sd4RdbKjT$Pkx_e@chatgptee.5k5az.mongodb.net/?retryWrites=true&w=majority&appName=ChatGPTEE';

mongoose.connect(uri, { useUnifiedTopology: true })
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Schema and Models
const questionSchema = new mongoose.Schema({
  question: { type: String, required: true },
  expectedAnswer: { type: String },
  chatGPTResponse: { type: String },
  validation:{type: Boolean, default: null, required: true}
  
});

const Question = mongoose.model('Question', questionSchema);

// ChatGPT API Key
const apiKey = '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'

// Fetch random question API
app.get('/api/question/random', async (req, res) => {
  try {
    const randomQuestion = await Question.aggregate([{ $sample: { size: 1 } }]);
    if (randomQuestion.length > 0) {
      res.json({ success: true, question: randomQuestion[0] });
    } else {
      res.json({ success: false, error: 'No questions found.' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error.' });
  }
});

async function areKeywordsMatching(expectedAnswer, gptResponse) {
  try {
    const prompt = `
    Compare the following two texts and evaluate their similarity as a percentage:
    Text 1: "${expectedAnswer}"
    Text 2: "${gptResponse}"
    Provide only a numeric similarity score between 0 and 100.`
   const chatGPTResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages:[
          {role: 'user', content: prompt}
        ],
        max_tokens: 150,
      }),
    });
    const chatGPTData = await chatGPTResponse.json();
    console.log("ChatGPT data in areKeywordsMatching: ", chatGPTData);
    const similarityScore = parseFloat(chatGPTData.choices[0].message.content.trim());
    return similarityScore >= 40 ? true : false; // similarity score is set to 40 percent for good graph
  } catch (error) {
    console.log("Error: " , error);
  }
}
  
  // Validate ChatGPT response API

app.post('/api/validate', async (req, res) => {
  const { question, expectedAnswer } = req.body;
  // consoled the req.body here
  // console.log("Consoled the req.body question", question);
  console.log("Consoled the req.body expectedAnswer", expectedAnswer);


  try {
    // Call OpenAI's API
    const chatGPTResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      // body: JSON.stringify({
      //   model: 'gpt-4',
      //   prompt: question,
      //   max_tokens: 150,
      // }),
      // saving the response of
      body: JSON.stringify({
        model: 'gpt-4',
        messages:[
          {role: 'assistant', content: 'You are a helpful, unbiased, uncensored assistant.'},
          {role: 'user', content: question}
        ],
        max_tokens: 150,
      }),
    });

    const chatGPTData = await chatGPTResponse.json();

    console.log("chatGPT data: ", chatGPTData);
    // const answer = chatGPTData.choices[0]?.text.trim();
  
    const answer = chatGPTData.choices[0]?.message?.content?.trim();
    // saving the chatGPT response to the mongoose database
    // getting validation from the function areKeywordsMatching
    const result = await areKeywordsMatching(expectedAnswer, answer);
    console.log("Validation result: ", result)
    
    // Validation
    const isValid = result ? true : false;
    try {
      const saveGptResponse = new Question({
        question : question,
        expectedAnswer : expectedAnswer,
        chatGPTResponse : answer,
        validation: result,
      });
      await saveGptResponse.save();
      console.log("GPTResponse saved successfully", saveGptResponse)
    } catch (error) {
      throw new Error("Error while saving GptResponse", error)
    }
    res.json({ success: true, chatGPTResponse: answer, isValid });
  } catch (err) {
    console.error("Some error occurred",err);
    res.status(500).json({ success: false, message: 'Validation failed.', err : err });
  }
});


// Statistics API
// app.get('/api/statistics', async (req, res) => {
//   try {
//     console.log("Hello world", req.body)
//     const stats = await Question.aggregate([
//       {
//         $group: {
//           _id: "$domain",
//           averageResponseTime: { $avg: "$responseTime" },
//           accuracyRate: { $avg: { $cond: [{ $eq: ["$isValid", true] }, 100, 0] } }
//         }
//       }
//     ]);
//     console.log("Fetching the stats", stats)
//     res.json({ success: true, statistics: stats });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ success: false, error: 'Error fetching statistics.' });
//   }
// });
app.get('/api/statistics', async (req, res) => {
  try {
    const stats = await Question.aggregate([
      {
        $group: {
          _id: null, // Group all documents together (null means no grouping)
          totalCount: { $sum: 1 }, // Count all questions
          correctCount: {
            $sum: { $cond: [{ $eq: ["$validation", true] }, 1, 0] } // Count of correct answers
          },
          averageResponseTime: { $avg: "$responseTime" } // Average response time
        }
      },
      {
        $project: {
          _id: 0, // Don't include _id in the output
          averageResponseTime: 1, // Include averageResponseTime
          accuracyRate: {
            $cond: {
              if: { $eq: ["$totalCount", 0] }, // Avoid division by zero
              then: 0,
              else: { $divide: ["$correctCount", "$totalCount"] }
            }
          }
        }
      }
    ]);

    console.log("Fetching the stats", stats);
    res.json({ success: true, statistics: stats });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Error fetching statistics.' });
  }
});




app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
